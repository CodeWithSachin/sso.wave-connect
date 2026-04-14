package handler

import (
	"errors"
	"time"

	"github.com/go-playground/validator/v10"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/rs/zerolog"

	"github.com/wave-connect/sso-platform/apps/identity-service/internal/id"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/model"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/repository"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/service"
)

type MfaHandler struct {
	mfaService     *service.MfaService
	mfaRepo        *repository.MfaRepository
	userRepo       *repository.UserRepository
	membershipRepo *repository.MembershipRepository
	familyRepo     *repository.RefreshFamilyRepository
	tokenSvc       *service.TokenService
	sessionSvc     *service.SessionService
	validate       *validator.Validate
	log            zerolog.Logger
	refreshTTL     time.Duration
}

func NewMfaHandler(
	mfaService *service.MfaService,
	mfaRepo *repository.MfaRepository,
	userRepo *repository.UserRepository,
	membershipRepo *repository.MembershipRepository,
	familyRepo *repository.RefreshFamilyRepository,
	tokenSvc *service.TokenService,
	sessionSvc *service.SessionService,
	validate *validator.Validate,
	log zerolog.Logger,
	refreshTTL time.Duration,
) *MfaHandler {
	return &MfaHandler{
		mfaService:     mfaService,
		mfaRepo:        mfaRepo,
		userRepo:       userRepo,
		membershipRepo: membershipRepo,
		familyRepo:     familyRepo,
		tokenSvc:       tokenSvc,
		sessionSvc:     sessionSvc,
		validate:       validate,
		log:            log.With().Str("component", "mfa_handler").Logger(),
		refreshTTL:     refreshTTL,
	}
}

// Enroll starts MFA enrollment for the authenticated user.
// POST /auth/mfa/enroll
func (h *MfaHandler) Enroll(c *fiber.Ctx) error {
	var req model.MfaEnrollRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	if err := h.validate.Struct(req); err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": formatValidationErrors(err)})
	}

	userID, ok := c.Locals("user_id").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "authentication required"})
	}

	email, _ := c.Locals("email").(string)

	resp, err := h.mfaService.Enroll(c.Context(), userID, email, req.Method)
	if err != nil {
		h.log.Error().Err(err).Str("user_id", userID.String()).Msg("failed to enroll MFA")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
	}

	return c.Status(fiber.StatusCreated).JSON(resp)
}

// VerifyEnrollment verifies a TOTP code to activate a pending enrollment.
// POST /auth/mfa/enroll/:id/verify
func (h *MfaHandler) VerifyEnrollment(c *fiber.Ctx) error {
	var req model.MfaEnrollVerifyRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	if err := h.validate.Struct(req); err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": formatValidationErrors(err)})
	}

	userID, ok := c.Locals("user_id").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "authentication required"})
	}

	enrollmentID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid enrollment ID"})
	}

	if err := h.mfaService.VerifyAndActivate(c.Context(), userID, enrollmentID, req.Code); err != nil {
		h.log.Warn().Err(err).Str("user_id", userID.String()).Msg("MFA enrollment verification failed")
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid TOTP code"})
	}

	return c.JSON(fiber.Map{"status": "active"})
}

// Verify validates an MFA code during the login flow (public endpoint).
// POST /auth/mfa/verify
func (h *MfaHandler) Verify(c *fiber.Ctx) error {
	var req model.MfaVerifyRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	if err := h.validate.Struct(req); err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": formatValidationErrors(err)})
	}

	tenantID, ok := c.Locals("tenant_id").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "tenant context required"})
	}

	userID, _, err := h.mfaService.ValidateChallengeToken(req.ChallengeToken, tenantID)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid or expired challenge token"})
	}

	if err := h.mfaService.Verify(c.Context(), userID, req.Code); err != nil {
		h.log.Warn().Err(err).Str("user_id", userID.String()).Msg("MFA verification failed")
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid MFA code"})
	}

	// MFA passed — issue full token set
	user, err := h.userRepo.GetByID(c.Context(), userID)
	if err != nil {
		h.log.Error().Err(err).Msg("failed to get user after MFA")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
	}

	membership, err := h.membershipRepo.GetByUserAndTenant(c.Context(), userID, tenantID)
	if err != nil {
		if errors.Is(err, repository.ErrMembershipNotFound) {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "no membership in this tenant"})
		}
		h.log.Error().Err(err).Msg("failed to get membership")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
	}

	now := time.Now().UTC()
	familyID := uuid.New().String()
	initialJTI := uuid.New().String()
	family := &model.RefreshTokenFamily{
		FamilyID:      familyID,
		UserID:        userID,
		TenantID:      tenantID,
		ClientID:      uuid.MustParse("00000000-0000-0000-0000-000000000001"),
		CurrentJTI:    initialJTI,
		Generation:    0,
		IsRevoked:     false,
		CreatedAt:     now,
		LastRotatedAt: now,
		ExpiresAt:     now.Add(h.refreshTTL),
	}
	if err := h.familyRepo.Create(c.Context(), family); err != nil {
		h.log.Error().Err(err).Msg("failed to create refresh family")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
	}

	tokens, err := h.tokenSvc.IssueTokenSet(c.Context(), user, tenantID, membership.DefaultScopes(), familyID)
	if err != nil {
		h.log.Error().Err(err).Msg("failed to issue tokens after MFA")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
	}

	sess, err := h.sessionSvc.Create(c.Context(), userID, tenantID, c.IP(), c.Get("User-Agent"))
	if err != nil {
		h.log.Error().Err(err).Msg("failed to create session after MFA")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
	}

	return c.JSON(model.LoginResponse{
		User: model.UserDTO{
			ID:          id.Format(id.PrefixUser, user.ID),
			Email:       user.Email,
			DisplayName: user.DisplayName,
			AvatarURL:   user.AvatarURL,
		},
		SessionID:    id.Format(id.PrefixSession, sess.ID),
		AccessToken:  tokens.AccessToken,
		RefreshToken: tokens.RefreshToken,
		IDToken:      tokens.IDToken,
		ExpiresIn:    tokens.ExpiresIn,
		TokenType:    tokens.TokenType,
	})
}

// ListEnrollments returns all active MFA enrollments for the authenticated user.
// GET /auth/mfa/enrollments
func (h *MfaHandler) ListEnrollments(c *fiber.Ctx) error {
	userID, ok := c.Locals("user_id").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "authentication required"})
	}

	enrollments, err := h.mfaService.ListEnrollments(c.Context(), userID)
	if err != nil {
		h.log.Error().Err(err).Str("user_id", userID.String()).Msg("failed to list enrollments")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
	}

	dtos := make([]model.MfaEnrollmentDTO, len(enrollments))
	for i, e := range enrollments {
		dtos[i] = model.MfaEnrollmentDTO{
			ID:         e.ID.String(),
			Method:     e.Method,
			Status:     e.Status,
			IsDefault:  e.IsDefault,
			LastUsedAt: e.LastUsedAt,
			CreatedAt:  e.CreatedAt,
		}
	}

	return c.JSON(fiber.Map{"enrollments": dtos})
}

// DeleteEnrollment removes an MFA enrollment for the authenticated user.
// DELETE /auth/mfa/enrollments/:id
func (h *MfaHandler) DeleteEnrollment(c *fiber.Ctx) error {
	userID, ok := c.Locals("user_id").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "authentication required"})
	}

	enrollmentID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid enrollment ID"})
	}

	if err := h.mfaService.DeleteEnrollment(c.Context(), enrollmentID, userID); err != nil {
		if errors.Is(err, repository.ErrEnrollmentNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "enrollment not found"})
		}
		h.log.Error().Err(err).Str("user_id", userID.String()).Msg("failed to delete enrollment")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
	}

	return c.SendStatus(fiber.StatusNoContent)
}
