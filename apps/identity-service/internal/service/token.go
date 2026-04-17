package service

import (
	"context"
	"crypto/ed25519"
	"errors"
	"fmt"
	"time"

	"aidanwoods.dev/go-paseto"
	"github.com/google/uuid"
	"github.com/rs/zerolog"

	"github.com/wave-connect/sso-platform/apps/identity-service/internal/config"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/model"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/repository"
)

var (
	ErrTokenExpired  = errors.New("token expired")
	ErrTokenDenied   = errors.New("token revoked")
	ErrTokenInvalid  = errors.New("token invalid")
	ErrReplayDetected = errors.New("refresh token replay detected")
)

type TokenService struct {
	cfg        config.TokenConfig
	symKey     paseto.V4SymmetricKey
	signingKey paseto.V4AsymmetricSecretKey
	verifyKey  paseto.V4AsymmetricPublicKey
	denyRepo   *repository.TokenDenyRepository
	familyRepo *repository.RefreshFamilyRepository
	log        zerolog.Logger
}

func NewTokenService(
	cfg config.TokenConfig,
	denyRepo *repository.TokenDenyRepository,
	familyRepo *repository.RefreshFamilyRepository,
	log zerolog.Logger,
) (*TokenService, error) {
	symKeyBytes, err := hexDecode(cfg.SymmetricKeyHex)
	if err != nil {
		return nil, fmt.Errorf("decode symmetric key: %w", err)
	}
	if len(symKeyBytes) != 32 {
		return nil, fmt.Errorf("symmetric key must be 32 bytes, got %d", len(symKeyBytes))
	}

	privKey, err := cfg.Ed25519PrivateKey()
	if err != nil {
		return nil, fmt.Errorf("load private key: %w", err)
	}

	// Build PASETO keys from raw bytes
	pasetoSymKey, err := buildSymmetricKey(symKeyBytes)
	if err != nil {
		return nil, fmt.Errorf("build paseto symmetric key: %w", err)
	}
	pasetoSecretKey, pasetoPublicKey, err := buildAsymmetricKeys(privKey)
	if err != nil {
		return nil, fmt.Errorf("build paseto asymmetric keys: %w", err)
	}

	return &TokenService{
		cfg:        cfg,
		symKey:     pasetoSymKey,
		signingKey: pasetoSecretKey,
		verifyKey:  pasetoPublicKey,
		denyRepo:   denyRepo,
		familyRepo: familyRepo,
		log:        log.With().Str("component", "token_service").Logger(),
	}, nil
}

func buildSymmetricKey(key []byte) (paseto.V4SymmetricKey, error) {
	return paseto.V4SymmetricKeyFromBytes(key)
}

func buildAsymmetricKeys(privKey ed25519.PrivateKey) (sk paseto.V4AsymmetricSecretKey, pk paseto.V4AsymmetricPublicKey, err error) {
	sk, err = paseto.NewV4AsymmetricSecretKeyFromEd25519(privKey)
	if err != nil {
		return
	}
	pk = sk.Public()
	return
}

// IssueTokenSet creates access, refresh, and ID tokens for a user.
func (s *TokenService) IssueTokenSet(ctx context.Context, user *model.User, tenantID uuid.UUID, scopes []string, familyID string) (*model.TokenSet, error) {
	now := time.Now().UTC()

	accessJTI := uuid.New().String()
	refreshJTI := uuid.New().String()
	idJTI := uuid.New().String()

	// Access token (v4.local — encrypted, symmetric)
	accessToken, err := s.createLocalToken(user, tenantID, scopes, accessJTI, now, s.cfg.AccessTTL)
	if err != nil {
		return nil, fmt.Errorf("create access token: %w", err)
	}

	// Refresh token (v4.local — encrypted, symmetric) — includes family_id and generation in claims
	refreshToken, err := s.createRefreshToken(user, tenantID, refreshJTI, familyID, now)
	if err != nil {
		return nil, fmt.Errorf("create refresh token: %w", err)
	}

	// ID token (v4.public — signed, asymmetric)
	idToken, err := s.createPublicToken(user, tenantID, scopes, idJTI, now, s.cfg.IDTTL)
	if err != nil {
		return nil, fmt.Errorf("create id token: %w", err)
	}

	return &model.TokenSet{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		IDToken:      idToken,
		ExpiresIn:    int(s.cfg.AccessTTL.Seconds()),
		TokenType:    "Bearer",
	}, nil
}

func (s *TokenService) createLocalToken(user *model.User, tenantID uuid.UUID, scopes []string, jti string, now time.Time, ttl time.Duration) (string, error) {
	token := paseto.NewToken()
	token.SetSubject(user.ID.String())
	token.SetIssuedAt(now)
	token.SetExpiration(now.Add(ttl))
	token.SetIssuer(s.cfg.Issuer)
	token.SetJti(jti)
	token.Set("tid", tenantID.String())
	token.Set("email", user.Email)
	token.Set("scopes", scopes)

	// Implicit assertion binds the token to the tenant (cross-tenant theft protection)
	implicit := []byte(tenantID.String())
	return token.V4Encrypt(s.symKey, implicit), nil
}

func (s *TokenService) createRefreshToken(user *model.User, tenantID uuid.UUID, jti string, familyID string, now time.Time) (string, error) {
	token := paseto.NewToken()
	token.SetSubject(user.ID.String())
	token.SetIssuedAt(now)
	token.SetExpiration(now.Add(s.cfg.RefreshTTL))
	token.SetIssuer(s.cfg.Issuer)
	token.SetJti(jti)
	token.Set("tid", tenantID.String())
	token.Set("fid", familyID)
	token.Set("type", "refresh")

	implicit := []byte(tenantID.String())
	return token.V4Encrypt(s.symKey, implicit), nil
}

func (s *TokenService) createPublicToken(user *model.User, tenantID uuid.UUID, scopes []string, jti string, now time.Time, ttl time.Duration) (string, error) {
	token := paseto.NewToken()
	token.SetSubject(user.ID.String())
	token.SetIssuedAt(now)
	token.SetExpiration(now.Add(ttl))
	token.SetIssuer(s.cfg.Issuer)
	token.SetJti(jti)
	token.Set("tid", tenantID.String())
	token.Set("email", user.Email)
	token.Set("name", user.DisplayName)
	token.Set("scopes", scopes)

	implicit := []byte(tenantID.String())
	return token.V4Sign(s.signingKey, implicit), nil
}

// DecryptAccessToken decrypts a v4.local access token and returns the claims.
func (s *TokenService) DecryptAccessToken(ctx context.Context, tokenStr string, tenantID uuid.UUID) (*model.TokenClaims, error) {
	parser := paseto.NewParser()
	parser.AddRule(paseto.IssuedBy(s.cfg.Issuer))

	implicit := []byte(tenantID.String())
	token, err := parser.ParseV4Local(s.symKey, tokenStr, implicit)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrTokenInvalid, err)
	}

	claims, err := extractClaims(token)
	if err != nil {
		return nil, err
	}

	denied, err := s.denyRepo.IsDenied(ctx, claims.JTI)
	if err != nil {
		return nil, fmt.Errorf("check deny list: %w", err)
	}
	if denied {
		return nil, ErrTokenDenied
	}

	return claims, nil
}

// ValidateTokenGeneric decrypts and validates a PASETO access token without requiring
// a tenant ID upfront. Tries decryption with nil implicit assertion first.
// Used by the gRPC IdentityService for cross-service token validation.
func (s *TokenService) ValidateTokenGeneric(ctx context.Context, tokenStr string) (*model.TokenClaims, error) {
	parser := paseto.NewParser()
	parser.AddRule(paseto.IssuedBy(s.cfg.Issuer))

	// Try with nil implicit (works if token was created without tenant-specific implicit)
	token, err := parser.ParseV4Local(s.symKey, tokenStr, nil)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrTokenInvalid, err)
	}

	claims, err := extractClaims(token)
	if err != nil {
		return nil, err
	}

	denied, err := s.denyRepo.IsDenied(ctx, claims.JTI)
	if err != nil {
		return nil, fmt.Errorf("check deny list: %w", err)
	}
	if denied {
		return nil, ErrTokenDenied
	}

	return claims, nil
}

// DecryptRefreshToken decrypts a v4.local refresh token.
func (s *TokenService) DecryptRefreshToken(tokenStr string, tenantID uuid.UUID) (*paseto.Token, error) {
	parser := paseto.NewParser()
	parser.AddRule(paseto.IssuedBy(s.cfg.Issuer))

	implicit := []byte(tenantID.String())
	token, err := parser.ParseV4Local(s.symKey, tokenStr, implicit)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrTokenInvalid, err)
	}
	return token, nil
}

// RotateRefresh handles refresh token rotation with replay detection.
func (s *TokenService) RotateRefresh(ctx context.Context, refreshTokenStr string, tenantID uuid.UUID) (*model.TokenSet, error) {
	token, err := s.DecryptRefreshToken(refreshTokenStr, tenantID)
	if err != nil {
		return nil, err
	}

	var tokenType string
	if err := token.Get("type", &tokenType); err != nil || tokenType != "refresh" {
		return nil, ErrTokenInvalid
	}

	sub, err := token.GetSubject()
	if err != nil {
		return nil, ErrTokenInvalid
	}
	userID, err := uuid.Parse(sub)
	if err != nil {
		return nil, ErrTokenInvalid
	}

	var familyID string
	if err := token.Get("fid", &familyID); err != nil {
		return nil, ErrTokenInvalid
	}

	jti, err := token.GetJti()
	if err != nil {
		return nil, ErrTokenInvalid
	}

	family, err := s.familyRepo.GetByID(ctx, familyID)
	if err != nil {
		return nil, fmt.Errorf("get family: %w", err)
	}
	if family.IsRevoked {
		return nil, ErrTokenDenied
	}

	// Replay detection: if presented JTI doesn't match current, the token was already used
	if family.CurrentJTI != jti {
		s.log.Warn().
			Str("family_id", familyID).
			Str("presented_jti", jti).
			Str("expected_jti", family.CurrentJTI).
			Msg("refresh token replay detected, revoking family")
		_ = s.familyRepo.Revoke(ctx, familyID)
		return nil, ErrReplayDetected
	}

	// Generate new refresh JTI and rotate
	newRefreshJTI := uuid.New().String()
	if err := s.familyRepo.Rotate(ctx, familyID, family.Generation, newRefreshJTI); err != nil {
		if errors.Is(err, repository.ErrGenerationMismatch) {
			_ = s.familyRepo.Revoke(ctx, familyID)
			return nil, ErrReplayDetected
		}
		return nil, fmt.Errorf("rotate family: %w", err)
	}

	// Build a minimal user for token creation
	user := &model.User{
		ID:    userID,
		Email: "", // Will be populated from the original token or membership lookup
	}

	return s.IssueTokenSet(ctx, user, tenantID, nil, familyID)
}

func (s *TokenService) RevokeToken(ctx context.Context, jti string, expiresAt time.Time) error {
	return s.denyRepo.Add(ctx, jti, expiresAt)
}

func (s *TokenService) PublicKeyHex() string {
	return s.verifyKey.ExportHex()
}

// CreateChallengeToken creates a short-lived PASETO v4.local token for the MFA challenge flow.
func (s *TokenService) CreateChallengeToken(userID uuid.UUID, tenantID uuid.UUID, allowedMethods []string) (string, error) {
	now := time.Now().UTC()
	token := paseto.NewToken()
	token.SetSubject(userID.String())
	token.SetIssuedAt(now)
	token.SetExpiration(now.Add(5 * time.Minute))
	token.SetIssuer(s.cfg.Issuer)
	token.SetJti(uuid.New().String())
	token.Set("tid", tenantID.String())
	token.Set("type", "mfa_challenge")
	token.Set("methods", allowedMethods)

	implicit := []byte(tenantID.String())
	return token.V4Encrypt(s.symKey, implicit), nil
}

// ValidateChallengeToken decrypts an MFA challenge token and returns the user ID and allowed methods.
func (s *TokenService) ValidateChallengeToken(tokenStr string, tenantID uuid.UUID) (uuid.UUID, []string, error) {
	parser := paseto.NewParser()
	parser.AddRule(paseto.IssuedBy(s.cfg.Issuer))

	implicit := []byte(tenantID.String())
	token, err := parser.ParseV4Local(s.symKey, tokenStr, implicit)
	if err != nil {
		return uuid.Nil, nil, fmt.Errorf("%w: %v", ErrTokenInvalid, err)
	}

	var tokenType string
	if err := token.Get("type", &tokenType); err != nil || tokenType != "mfa_challenge" {
		return uuid.Nil, nil, fmt.Errorf("%w: not an mfa_challenge token", ErrTokenInvalid)
	}

	sub, err := token.GetSubject()
	if err != nil {
		return uuid.Nil, nil, fmt.Errorf("%w: missing subject", ErrTokenInvalid)
	}
	userID, err := uuid.Parse(sub)
	if err != nil {
		return uuid.Nil, nil, fmt.Errorf("%w: invalid subject uuid", ErrTokenInvalid)
	}

	var methods []string
	if err := token.Get("methods", &methods); err != nil {
		return uuid.Nil, nil, fmt.Errorf("%w: missing methods", ErrTokenInvalid)
	}

	return userID, methods, nil
}

func extractClaims(token *paseto.Token) (*model.TokenClaims, error) {
	sub, err := token.GetSubject()
	if err != nil {
		return nil, fmt.Errorf("get subject: %w", err)
	}
	userID, err := uuid.Parse(sub)
	if err != nil {
		return nil, fmt.Errorf("parse subject uuid: %w", err)
	}

	jti, err := token.GetJti()
	if err != nil {
		return nil, fmt.Errorf("get jti: %w", err)
	}

	iat, err := token.GetIssuedAt()
	if err != nil {
		return nil, fmt.Errorf("get iat: %w", err)
	}

	exp, err := token.GetExpiration()
	if err != nil {
		return nil, fmt.Errorf("get exp: %w", err)
	}

	var tenantIDStr string
	if err := token.Get("tid", &tenantIDStr); err != nil {
		return nil, fmt.Errorf("get tid: %w", err)
	}
	tenantID, err := uuid.Parse(tenantIDStr)
	if err != nil {
		return nil, fmt.Errorf("parse tid: %w", err)
	}

	var email string
	_ = token.Get("email", &email)

	var scopes []string
	_ = token.Get("scopes", &scopes)

	return &model.TokenClaims{
		Subject:  userID,
		TenantID: tenantID,
		Email:    email,
		Scopes:   scopes,
		JTI:      jti,
		IssuedAt: iat,
		Expiry:   exp,
	}, nil
}

func hexDecode(s string) ([]byte, error) {
	b := make([]byte, len(s)/2)
	for i := 0; i < len(s); i += 2 {
		hi := hexCharToByte(s[i])
		lo := hexCharToByte(s[i+1])
		if hi == 0xFF || lo == 0xFF {
			return nil, fmt.Errorf("invalid hex char at position %d", i)
		}
		b[i/2] = hi<<4 | lo
	}
	return b, nil
}

func hexCharToByte(c byte) byte {
	switch {
	case c >= '0' && c <= '9':
		return c - '0'
	case c >= 'a' && c <= 'f':
		return c - 'a' + 10
	case c >= 'A' && c <= 'F':
		return c - 'A' + 10
	default:
		return 0xFF
	}
}
