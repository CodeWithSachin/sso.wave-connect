package handler

import (
	"errors"
	"time"

	"github.com/go-playground/validator/v10"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/rs/zerolog"

	"github.com/wave-connect/sso-platform/apps/identity-service/internal/config"
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
	webauthnSvc    *service.WebAuthnService
	validate       *validator.Validate
	log            zerolog.Logger
	refreshTTL     time.Duration
	cookieCfg      config.CookieConfig
}

func NewMfaHandler(
	mfaService *service.MfaService,
	mfaRepo *repository.MfaRepository,
	userRepo *repository.UserRepository,
	membershipRepo *repository.MembershipRepository,
	familyRepo *repository.RefreshFamilyRepository,
	tokenSvc *service.TokenService,
	sessionSvc *service.SessionService,
	webauthnSvc *service.WebAuthnService,
	validate *validator.Validate,
	log zerolog.Logger,
	refreshTTL time.Duration,
	cookieCfg config.CookieConfig,
) *MfaHandler {
	return &MfaHandler{
		mfaService:     mfaService,
		mfaRepo:        mfaRepo,
		userRepo:       userRepo,
		membershipRepo: membershipRepo,
		familyRepo:     familyRepo,
		tokenSvc:       tokenSvc,
		sessionSvc:     sessionSvc,
		webauthnSvc:    webauthnSvc,
		validate:       validate,
		log:            log.With().Str("component", "mfa_handler").Logger(),
		refreshTTL:     refreshTTL,
		cookieCfg:      cookieCfg,
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

	// Set SSO session cookie (HttpOnly — enables cross-app auto-login via sso-service)
	if sess.RawToken != "" {
		c.Cookie(&fiber.Cookie{
			Name:     "sso_session",
			Value:    sess.RawToken,
			Path:     "/",
			Domain:   h.cookieCfg.Domain,
			HTTPOnly: true,
			Secure:   h.cookieCfg.Secure,
			SameSite: "Lax",
			MaxAge:   int(time.Until(sess.ExpiresAt).Seconds()),
		})
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

// RegenerateBackupCodes generates a new set of backup codes, replacing old ones.
// POST /auth/mfa/backup-codes/regenerate
func (h *MfaHandler) RegenerateBackupCodes(c *fiber.Ctx) error {
	userID, ok := c.Locals("user_id").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "authentication required"})
	}

	codes, err := h.mfaService.RegenerateBackupCodes(c.Context(), userID)
	if err != nil {
		h.log.Error().Err(err).Str("user_id", userID.String()).Msg("failed to regenerate backup codes")
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(model.BackupCodeRegenerateResponse{
		BackupCodes: codes,
		Count:       len(codes),
	})
}

// BeginWebAuthnRegistration starts a WebAuthn registration ceremony.
// POST /auth/mfa/webauthn/register/begin
func (h *MfaHandler) BeginWebAuthnRegistration(c *fiber.Ctx) error {
	if h.webauthnSvc == nil {
		return c.Status(fiber.StatusNotImplemented).JSON(fiber.Map{"error": "WebAuthn is not configured"})
	}

	userID, ok := c.Locals("user_id").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "authentication required"})
	}

	user, err := h.userRepo.GetByID(c.Context(), userID)
	if err != nil {
		h.log.Error().Err(err).Msg("failed to get user for webauthn registration")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
	}

	options, enrollmentID, err := h.webauthnSvc.BeginRegistration(c.Context(), user)
	if err != nil {
		h.log.Error().Err(err).Msg("failed to begin webauthn registration")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
	}

	return c.JSON(model.WebAuthnBeginRegisterResponse{
		Options:      options,
		EnrollmentID: enrollmentID,
	})
}

// CompleteWebAuthnRegistration finishes a WebAuthn registration ceremony.
// POST /auth/mfa/webauthn/register/complete
func (h *MfaHandler) CompleteWebAuthnRegistration(c *fiber.Ctx) error {
	if h.webauthnSvc == nil {
		return c.Status(fiber.StatusNotImplemented).JSON(fiber.Map{"error": "WebAuthn is not configured"})
	}

	userID, ok := c.Locals("user_id").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "authentication required"})
	}

	var req model.WebAuthnCompleteRegisterRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	user, err := h.userRepo.GetByID(c.Context(), userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
	}

	credJSON, _ := c.Body(), error(nil)
	enrollment, err := h.webauthnSvc.CompleteRegistration(c.Context(), user, req.EnrollmentID, credJSON)
	if err != nil {
		h.log.Warn().Err(err).Msg("webauthn registration completion failed")
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"status":        "active",
		"enrollment_id": enrollment.ID.String(),
		"method":        "webauthn",
	})
}

// BeginWebAuthnLogin starts a WebAuthn login ceremony.
// POST /auth/mfa/webauthn/login/begin
func (h *MfaHandler) BeginWebAuthnLogin(c *fiber.Ctx) error {
	if h.webauthnSvc == nil {
		return c.Status(fiber.StatusNotImplemented).JSON(fiber.Map{"error": "WebAuthn is not configured"})
	}

	userID, ok := c.Locals("user_id").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "authentication required"})
	}

	user, err := h.userRepo.GetByID(c.Context(), userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
	}

	options, err := h.webauthnSvc.BeginLogin(c.Context(), user)
	if err != nil {
		h.log.Error().Err(err).Msg("failed to begin webauthn login")
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(model.WebAuthnBeginLoginResponse{Options: options})
}

// CompleteWebAuthnLogin finishes a WebAuthn login ceremony.
// POST /auth/mfa/webauthn/login/complete
func (h *MfaHandler) CompleteWebAuthnLogin(c *fiber.Ctx) error {
	if h.webauthnSvc == nil {
		return c.Status(fiber.StatusNotImplemented).JSON(fiber.Map{"error": "WebAuthn is not configured"})
	}

	userID, ok := c.Locals("user_id").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "authentication required"})
	}

	user, err := h.userRepo.GetByID(c.Context(), userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
	}

	if err := h.webauthnSvc.CompleteLogin(c.Context(), user, c.Body()); err != nil {
		h.log.Warn().Err(err).Msg("webauthn login verification failed")
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{"status": "verified"})
}

// DeleteEnrollment removes an MFA enrollment for the authenticated user.
// DELETE /auth/mfa/enrollments/:id
//
// When the tenant policy has password_require_mfa=true, this refuses to remove
// the last active enrollment — the user must enroll a replacement first. The
// race-free check lives in repository.DeleteEnrollmentEnforcingPolicy.
func (h *MfaHandler) DeleteEnrollment(c *fiber.Ctx) error {
	userID, ok := c.Locals("user_id").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "authentication required"})
	}

	enrollmentID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid enrollment ID"})
	}

	// The tenant-policy middleware (internal/middleware/policy.go) places the
	// resolved *model.TenantPolicy into Locals on every tenant-scoped route.
	// If it's absent we treat the request as not-policy-gated; existing behavior.
	var requireMFA bool
	var allowedMethods []string
	if policy, ok := c.Locals("tenant_policy").(*model.TenantPolicy); ok && policy != nil {
		requireMFA = policy.PasswordRequireMFA
		allowedMethods = policy.AllowedMFAMethods
	}

	if err := h.mfaRepo.DeleteEnrollmentEnforcingPolicy(c.Context(), enrollmentID, userID, requireMFA); err != nil {
		if errors.Is(err, repository.ErrEnrollmentNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "enrollment not found"})
		}
		if errors.Is(err, repository.ErrMfaRequiredByPolicy) {
			methods := allowedMethods
			if len(methods) == 0 {
				methods = []string{"totp", "webauthn"}
			}
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{
				"error":           "mfa_required_by_policy",
				"message":         "your organization requires MFA; enroll a replacement method before removing this one",
				"allowed_methods": methods,
			})
		}
		h.log.Error().Err(err).Str("user_id", userID.String()).Msg("failed to delete enrollment")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
	}

	return c.SendStatus(fiber.StatusNoContent)
}
