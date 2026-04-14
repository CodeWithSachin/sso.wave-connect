package service

import (
	"context"
	"crypto/rand"
	"fmt"
	"math/big"
	"time"

	"github.com/google/uuid"
	"github.com/pquerna/otp"
	"github.com/pquerna/otp/totp"
	"github.com/rs/zerolog"
	"golang.org/x/crypto/bcrypt"

	"github.com/wave-connect/sso-platform/apps/identity-service/internal/model"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/repository"
)

const (
	backupCodeCount  = 10
	backupCodeLength = 8
	backupCodeChars  = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
)

type MfaService struct {
	mfaRepo  *repository.MfaRepository
	tokenSvc *TokenService
	log      zerolog.Logger
}

func NewMfaService(
	mfaRepo *repository.MfaRepository,
	tokenSvc *TokenService,
	log zerolog.Logger,
) *MfaService {
	return &MfaService{
		mfaRepo:  mfaRepo,
		tokenSvc: tokenSvc,
		log:      log.With().Str("component", "mfa_service").Logger(),
	}
}

// Enroll starts TOTP enrollment for a user. Returns the otpauth URI, backup codes, and enrollment ID.
func (s *MfaService) Enroll(ctx context.Context, userID uuid.UUID, email string, method string) (*model.MfaEnrollResponse, error) {
	if method != "totp" {
		return nil, fmt.Errorf("unsupported MFA method: %s", method)
	}

	key, err := totp.Generate(totp.GenerateOpts{
		Issuer:      "WaveConnect SSO",
		AccountName: email,
		Period:      30,
		Digits:      otp.DigitsSix,
		Algorithm:   otp.AlgorithmSHA1,
	})
	if err != nil {
		return nil, fmt.Errorf("generate totp key: %w", err)
	}

	now := time.Now().UTC()
	enrollmentID := uuid.New()
	enrollment := &model.MfaEnrollment{
		ID:              enrollmentID,
		UserID:          userID,
		Method:          method,
		Status:          "pending_setup",
		SecretEncrypted: key.Secret(),
		IsDefault:       false,
		CreatedAt:       now,
		UpdatedAt:       now,
	}

	if err := s.mfaRepo.CreateEnrollment(ctx, enrollment); err != nil {
		return nil, fmt.Errorf("create enrollment: %w", err)
	}

	// Generate backup codes
	plaintextCodes, codeHashes, err := generateBackupCodes()
	if err != nil {
		return nil, fmt.Errorf("generate backup codes: %w", err)
	}

	if err := s.mfaRepo.CreateBackupCodes(ctx, userID, codeHashes); err != nil {
		return nil, fmt.Errorf("store backup codes: %w", err)
	}

	s.log.Info().
		Str("user_id", userID.String()).
		Str("enrollment_id", enrollmentID.String()).
		Msg("MFA enrollment created")

	return &model.MfaEnrollResponse{
		SecretURI:    key.URL(),
		BackupCodes:  plaintextCodes,
		EnrollmentID: enrollmentID.String(),
	}, nil
}

// VerifyAndActivate validates a TOTP code during enrollment and activates the enrollment.
func (s *MfaService) VerifyAndActivate(ctx context.Context, userID uuid.UUID, enrollmentID uuid.UUID, code string) error {
	enrollment, err := s.mfaRepo.GetEnrollmentByID(ctx, enrollmentID)
	if err != nil {
		return fmt.Errorf("get enrollment: %w", err)
	}

	if enrollment.UserID != userID {
		return fmt.Errorf("enrollment does not belong to user")
	}

	if enrollment.Status != "pending_setup" {
		return fmt.Errorf("enrollment is not pending setup")
	}

	valid := totp.Validate(code, enrollment.SecretEncrypted)
	if !valid {
		return fmt.Errorf("invalid TOTP code")
	}

	if err := s.mfaRepo.ActivateEnrollment(ctx, enrollmentID); err != nil {
		return fmt.Errorf("activate enrollment: %w", err)
	}

	s.log.Info().
		Str("user_id", userID.String()).
		Str("enrollment_id", enrollmentID.String()).
		Msg("MFA enrollment activated")

	return nil
}

// Verify validates a TOTP or backup code for an authenticated user during the MFA challenge flow.
func (s *MfaService) Verify(ctx context.Context, userID uuid.UUID, code string) error {
	enrollments, err := s.mfaRepo.GetActiveEnrollments(ctx, userID)
	if err != nil {
		return fmt.Errorf("get active enrollments: %w", err)
	}

	// Try TOTP first
	for _, e := range enrollments {
		if e.Method == "totp" {
			if totp.Validate(code, e.SecretEncrypted) {
				_ = s.mfaRepo.UpdateLastUsed(ctx, e.ID)
				return nil
			}
		}
	}

	// Try as backup code (only if there are active enrollments)
	if len(enrollments) > 0 {
		used, err := s.tryBackupCode(ctx, userID, code)
		if err != nil {
			return fmt.Errorf("try backup code: %w", err)
		}
		if used {
			s.log.Warn().
				Str("user_id", userID.String()).
				Msg("backup code used for MFA verification")
			return nil
		}
	}

	return fmt.Errorf("invalid MFA code")
}

// CreateChallengeToken delegates to TokenService to create an MFA challenge PASETO token.
func (s *MfaService) CreateChallengeToken(userID uuid.UUID, tenantID uuid.UUID, allowedMethods []string) (string, error) {
	return s.tokenSvc.CreateChallengeToken(userID, tenantID, allowedMethods)
}

// ValidateChallengeToken delegates to TokenService to decrypt and validate an MFA challenge token.
func (s *MfaService) ValidateChallengeToken(tokenStr string, tenantID uuid.UUID) (uuid.UUID, []string, error) {
	return s.tokenSvc.ValidateChallengeToken(tokenStr, tenantID)
}

// ListEnrollments returns all active MFA enrollments for a user.
func (s *MfaService) ListEnrollments(ctx context.Context, userID uuid.UUID) ([]model.MfaEnrollment, error) {
	return s.mfaRepo.GetActiveEnrollments(ctx, userID)
}

// DeleteEnrollment removes an MFA enrollment belonging to the user.
func (s *MfaService) DeleteEnrollment(ctx context.Context, id uuid.UUID, userID uuid.UUID) error {
	return s.mfaRepo.DeleteEnrollment(ctx, id, userID)
}

// tryBackupCode iterates through unused backup codes and compares with bcrypt.
func (s *MfaService) tryBackupCode(ctx context.Context, userID uuid.UUID, code string) (bool, error) {
	codes, err := s.mfaRepo.GetUnusedBackupCodes(ctx, userID)
	if err != nil {
		return false, fmt.Errorf("get unused backup codes: %w", err)
	}

	for _, c := range codes {
		if err := bcrypt.CompareHashAndPassword([]byte(c.CodeHash), []byte(code)); err == nil {
			if err := s.mfaRepo.MarkBackupCodeUsed(ctx, c.ID); err != nil {
				return false, fmt.Errorf("mark backup code used: %w", err)
			}
			return true, nil
		}
	}
	return false, nil
}

func generateBackupCodes() (plaintext []string, hashes []string, err error) {
	plaintext = make([]string, backupCodeCount)
	hashes = make([]string, backupCodeCount)

	for i := 0; i < backupCodeCount; i++ {
		code, err := randomAlphanumeric(backupCodeLength)
		if err != nil {
			return nil, nil, fmt.Errorf("generate random code: %w", err)
		}
		plaintext[i] = code

		hash, err := hashBackupCode(code)
		if err != nil {
			return nil, nil, fmt.Errorf("hash backup code: %w", err)
		}
		hashes[i] = hash
	}

	return plaintext, hashes, nil
}

func randomAlphanumeric(length int) (string, error) {
	result := make([]byte, length)
	max := big.NewInt(int64(len(backupCodeChars)))
	for i := range result {
		n, err := rand.Int(rand.Reader, max)
		if err != nil {
			return "", err
		}
		result[i] = backupCodeChars[n.Int64()]
	}
	return string(result), nil
}

func hashBackupCode(code string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(code), bcrypt.DefaultCost)
	if err != nil {
		return "", fmt.Errorf("bcrypt hash: %w", err)
	}
	return string(hash), nil
}
