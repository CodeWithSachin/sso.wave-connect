package handler

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/go-playground/validator/v10"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/rs/zerolog"

	"github.com/wave-connect/sso-platform/apps/identity-service/internal/config"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/event"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/id"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/model"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/repository"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/service"
)

type AuthHandler struct {
	userRepo       *repository.UserRepository
	membershipRepo *repository.MembershipRepository
	familyRepo     *repository.RefreshFamilyRepository
	passwordSvc    *service.PasswordService
	tokenSvc       *service.TokenService
	sessionSvc     *service.SessionService
	mfaService     *service.MfaService
	mfaRepo        *repository.MfaRepository
	publisher      event.Publisher
	validate       *validator.Validate
	log            zerolog.Logger
	refreshTTL     time.Duration
	cookieCfg      config.CookieConfig
}

func NewAuthHandler(
	userRepo *repository.UserRepository,
	membershipRepo *repository.MembershipRepository,
	familyRepo *repository.RefreshFamilyRepository,
	passwordSvc *service.PasswordService,
	tokenSvc *service.TokenService,
	sessionSvc *service.SessionService,
	mfaService *service.MfaService,
	mfaRepo *repository.MfaRepository,
	publisher event.Publisher,
	validate *validator.Validate,
	log zerolog.Logger,
	refreshTTL time.Duration,
	cookieCfg config.CookieConfig,
) *AuthHandler {
	return &AuthHandler{
		userRepo:       userRepo,
		membershipRepo: membershipRepo,
		familyRepo:     familyRepo,
		passwordSvc:    passwordSvc,
		tokenSvc:       tokenSvc,
		sessionSvc:     sessionSvc,
		mfaService:     mfaService,
		mfaRepo:        mfaRepo,
		publisher:      publisher,
		validate:       validate,
		log:            log.With().Str("component", "auth_handler").Logger(),
		refreshTTL:     refreshTTL,
		cookieCfg:      cookieCfg,
	}
}

// Register creates a tenant-scoped user account from email + password.
//
//	@Summary	Register a user
//	@Tags		auth
//	@Accept		json
//	@Produce	json
//	@Param		X-Tenant-ID	header		string					true	"Tenant ID"
//	@Param		body		body		model.RegisterRequest	true	"Registration payload"
//	@Success	201			{object}	model.AuthResponse
//	@Failure	400			{object}	model.ErrorResponse
//	@Failure	409			{object}	model.ErrorResponse
//	@Router		/auth/register [post]
func (h *AuthHandler) Register(c *fiber.Ctx) error {
	var req model.RegisterRequest
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

	// --- Tenant policy enforcement ---
	if policy, ok := c.Locals("tenant_policy").(*model.TenantPolicy); ok {
		if len(req.Password) < policy.PasswordMinLength {
			return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{
				"error": fmt.Sprintf("password must be at least %d characters", policy.PasswordMinLength),
			})
		}
		if !policy.IsEmailDomainAllowed(req.Email) {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error":   "email_domain_not_allowed",
				"message": "your email domain is not permitted by this organization",
			})
		}
	}

	hash, err := h.passwordSvc.Hash(req.Password)
	if err != nil {
		h.log.Error().Err(err).Msg("failed to hash password")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
	}

	now := time.Now().UTC()
	userID, _ := id.New(id.PrefixUser)
	user := &model.User{
		ID:           userID,
		Email:        req.Email,
		PasswordHash: hash,
		DisplayName:  req.DisplayName,
		Status:       "active",
		CreatedAt:    now,
		UpdatedAt:    now,
	}

	if err := h.userRepo.Create(c.Context(), user); err != nil {
		if errors.Is(err, repository.ErrEmailTaken) {
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "email already registered"})
		}
		h.log.Error().Err(err).Msg("failed to create user")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
	}

	memID, _ := id.New(id.PrefixMembership)
	membership := &model.Membership{
		ID:        memID,
		UserID:    userID,
		TenantID:  tenantID,
		Role:      "member",
		JoinedAt:  now,
		CreatedAt: now,
		UpdatedAt: now,
	}
	if err := h.membershipRepo.Create(c.Context(), membership); err != nil {
		h.log.Error().Err(err).Msg("failed to create membership")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
	}

	// Create refresh token family
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
		h.log.Error().Err(err).Msg("failed to issue tokens")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
	}

	_ = h.publisher.Publish(c.Context(), event.Event{
		Type:      event.TypeUserCreated,
		Timestamp: now,
		TenantID:  tenantID,
		ActorID:   userID,
		Payload: event.UserCreatedPayload{
			UserID:      userID,
			Email:       user.Email,
			DisplayName: user.DisplayName,
		},
	})

	return c.Status(fiber.StatusCreated).JSON(model.RegisterResponse{
		User: model.UserDTO{
			ID:          id.Format(id.PrefixUser, userID),
			Email:       user.Email,
			DisplayName: user.DisplayName,
		},
		AccessToken:  tokens.AccessToken,
		RefreshToken: tokens.RefreshToken,
		IDToken:      tokens.IDToken,
		ExpiresIn:    tokens.ExpiresIn,
		TokenType:    tokens.TokenType,
	})
}

// Login authenticates a user with email + password and starts a session.
//
//	@Summary	Login
//	@Tags		auth
//	@Accept		json
//	@Produce	json
//	@Param		X-Tenant-ID	header		string				true	"Tenant ID"
//	@Param		body		body		model.LoginRequest	true	"Login credentials"
//	@Success	200			{object}	model.AuthResponse
//	@Failure	401			{object}	model.ErrorResponse
//	@Router		/auth/login [post]
func (h *AuthHandler) Login(c *fiber.Ctx) error {
	var req model.LoginRequest
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

	user, err := h.userRepo.GetByEmail(c.Context(), req.Email)
	if err != nil {
		if errors.Is(err, repository.ErrUserNotFound) {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid credentials"})
		}
		h.log.Error().Err(err).Msg("failed to get user")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
	}

	if user.Status != "active" {
		if user.Status == "pending_verification" {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error":   "email_not_verified",
				"message": "please verify your email address before signing in",
			})
		}
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "account disabled"})
	}

	valid, err := h.passwordSvc.Verify(req.Password, user.PasswordHash)
	if err != nil || !valid {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid credentials"})
	}

	// Check if org policy requires MFA but user hasn't enrolled
	if policy, ok := c.Locals("tenant_policy").(*model.TenantPolicy); ok && policy.PasswordRequireMFA {
		hasMfaForPolicy, _ := h.mfaRepo.HasActiveEnrollment(c.Context(), user.ID)
		if !hasMfaForPolicy {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error":   "mfa_enrollment_required",
				"message": "your organization requires multi-factor authentication; please enroll an MFA method",
				"allowed_methods": func() []string {
					if len(policy.AllowedMFAMethods) > 0 {
						return policy.AllowedMFAMethods
					}
					return []string{"totp", "webauthn"}
				}(),
			})
		}
	}

	// Check if user has active MFA enrollment
	hasMfa, err := h.mfaRepo.HasActiveEnrollment(c.Context(), user.ID)
	if err != nil {
		h.log.Error().Err(err).Msg("failed to check MFA enrollment")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
	}
	if hasMfa {
		enrollments, err := h.mfaRepo.GetActiveEnrollments(c.Context(), user.ID)
		if err != nil {
			h.log.Error().Err(err).Msg("failed to get MFA enrollments")
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
		}
		methods := make([]string, 0, len(enrollments))
		for _, e := range enrollments {
			methods = append(methods, e.Method)
		}
		// Always allow backup_code as a fallback
		methods = append(methods, "backup_code")

		challengeToken, err := h.mfaService.CreateChallengeToken(user.ID, tenantID, methods)
		if err != nil {
			h.log.Error().Err(err).Msg("failed to create MFA challenge token")
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
		}

		return c.JSON(model.MfaChallengeResponse{
			MfaRequired:    true,
			ChallengeToken: challengeToken,
			AllowedMethods: methods,
		})
	}

	membership, err := h.membershipRepo.GetByUserAndTenant(c.Context(), user.ID, tenantID)
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
		UserID:        user.ID,
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
		h.log.Error().Err(err).Msg("failed to issue tokens")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
	}

	sess, err := h.sessionSvc.Create(c.Context(), user.ID, tenantID, c.IP(), c.Get("User-Agent"))
	if err != nil {
		h.log.Error().Err(err).Msg("failed to create session")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
	}

	// Set SSO session cookie (HttpOnly — enables cross-app auto-login via sso-service)
	h.setSSOCookie(c, sess)

	_ = h.publisher.Publish(c.Context(), event.Event{
		Type:      event.TypeUserLogin,
		Timestamp: now,
		TenantID:  tenantID,
		ActorID:   user.ID,
		Payload: event.UserLoginPayload{
			UserID:    user.ID,
			IPAddress: c.IP(),
			UserAgent: c.Get("User-Agent"),
		},
	})

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

// Logout revokes the session identified by the sso_session cookie and clears the cookie.
// Unlike DELETE /sessions/:id (which requires PASETO Bearer auth), this endpoint identifies
// the session solely by the cookie value — so it works even after the access_token has been
// discarded (the new session-cookie auth model).
//
// Returns 204 No Content on success or if there was nothing to revoke (idempotent).
// Logout revokes the session bound to the sso_session cookie. Idempotent.
//
//	@Summary	Logout
//	@Tags		auth
//	@Success	204
//	@Router		/logout [post]
func (h *AuthHandler) Logout(c *fiber.Ctx) error {
	cookieValue := c.Cookies("sso_session")
	// Always clear the cookie, even if we can't find a matching session — the client
	// reached here intending to log out, and we should respect that.
	h.clearSSOCookie(c)

	if cookieValue == "" {
		return c.SendStatus(fiber.StatusNoContent)
	}

	tokenHash, err := hashSessionCookie(cookieValue)
	if err != nil {
		// Malformed cookie — nothing to revoke, just report success (cookie already cleared).
		return c.SendStatus(fiber.StatusNoContent)
	}

	sess, err := h.sessionSvc.RevokeByTokenHash(c.Context(), tokenHash)
	if err != nil {
		// Session not found or already revoked — still success from the client's perspective.
		h.log.Debug().Err(err).Msg("logout: session not found or already revoked")
		return c.SendStatus(fiber.StatusNoContent)
	}

	h.log.Info().
		Str("session_id", sess.ID.String()).
		Str("user_id", sess.UserID.String()).
		Msg("session revoked via /auth/logout")
	return c.SendStatus(fiber.StatusNoContent)
}

// clearSSOCookie delegates to the package-level helper so every clear in
// identity-service produces an identical Set-Cookie (same Name/Path/Domain),
// which is the *only* way the browser will overwrite the existing cookie
// rather than store a sibling. See cookie.go.
func (h *AuthHandler) clearSSOCookie(c *fiber.Ctx) {
	clearSSOCookieHelper(c, h.cookieCfg)
}

// hashSessionCookie decodes the base64url raw token and returns its SHA-256 hex hash —
// matching the storage format of sessions.token_hash.
func hashSessionCookie(raw string) (string, error) {
	b, err := base64.RawURLEncoding.DecodeString(raw)
	if err != nil {
		return "", err
	}
	h := sha256.Sum256(b)
	return hex.EncodeToString(h[:]), nil
}

// setSSOCookie delegates to the package-level helper. See cookie.go for the
// canonical attribute set — keeping this one place avoids the sibling-cookie
// pile-up the architecture review (ADR-0002 §C) called out.
func (h *AuthHandler) setSSOCookie(c *fiber.Ctx, sess *model.Session) {
	setSSOCookie(c, sess, h.cookieCfg)
}

func formatValidationErrors(err error) string {
	if ve, ok := err.(validator.ValidationErrors); ok {
		msg := ""
		for i, fe := range ve {
			if i > 0 {
				msg += "; "
			}
			msg += fe.Field() + " " + fe.Tag()
			if fe.Param() != "" {
				msg += "=" + fe.Param()
			}
		}
		return msg
	}
	return err.Error()
}
