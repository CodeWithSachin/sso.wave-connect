// Package handler — signup.go
//
// Tenantless public-signup surface for Phase 1 of the dual-product onboarding
// plan. Registered in `main.go` under `/auth/public/*`, OUTSIDE the
// `TenantExtraction` middleware group — these endpoints cannot require an
// `X-Tenant-ID` header because the tenant doesn't exist yet.
//
// Endpoints:
//
//	POST /auth/public/signup           → 201 + sso_session cookie + body
//	POST /auth/public/verify-email     → 204 on success, 410 on invalid/expired
//	POST /auth/public/verify-email/resend → 202 always (enumeration-resistant)
package handler

import (
	"errors"

	"github.com/go-playground/validator/v10"
	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog"

	"github.com/wave-connect/sso-platform/apps/identity-service/internal/config"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/id"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/repository"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/service"
)

type SignupHandler struct {
	svc       *service.SignupService
	validate  *validator.Validate
	log       zerolog.Logger
	cookieCfg config.CookieConfig
}

// NewSignupHandler wires the signup service + validation + cookie config.
func NewSignupHandler(
	svc *service.SignupService,
	validate *validator.Validate,
	log zerolog.Logger,
	cookieCfg config.CookieConfig,
) *SignupHandler {
	return &SignupHandler{
		svc:       svc,
		validate:  validate,
		log:       log.With().Str("component", "signup_handler").Logger(),
		cookieCfg: cookieCfg,
	}
}

// Signup creates a personal tenant + user + membership + session atomically.
// On success it sets the sso_session cookie and returns 201 with the new
// user + tenant. See `service.SignupService.Signup` for the invariants.
func (h *SignupHandler) Signup(c *fiber.Ctx) error {
	var req service.SignupRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	if err := h.validate.Struct(req); err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": formatValidationErrors(err)})
	}

	result, err := h.svc.Signup(c.Context(), req, c.IP(), c.Get("User-Agent"))
	if err != nil {
		switch {
		case errors.Is(err, service.ErrEmailTaken):
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "email already registered"})
		case errors.Is(err, service.ErrDomainClaimed):
			// Phase 2+ — won't fire in Phase 1 because tenant_domains is empty.
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{
				"error":   "domain_managed",
				"message": "this email domain is managed by an organization — sign in through your org's login",
			})
		default:
			h.log.Error().Err(err).Msg("signup failed")
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
		}
	}

	// Session was created inside the service; RawToken is populated only at
	// creation time and only on the returned *model.Session.
	setSSOCookie(c, result.Session, h.cookieCfg)

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"user": fiber.Map{
			"id":           id.Format(id.PrefixUser, result.User.ID),
			"email":        result.User.Email,
			"display_name": result.User.DisplayName,
			"status":       result.User.Status,
		},
		"tenant": fiber.Map{
			"id":          id.Format(id.PrefixTenant, result.Tenant.ID),
			"slug":        result.Tenant.Slug,
			"name":        result.Tenant.Name,
			"tenant_kind": result.Tenant.TenantKind,
		},
		"session_id":               id.Format(id.PrefixSession, result.Session.ID),
		"email_verification_sent":  true,
		"email_verification_notice": "check your inbox to verify your email; some actions are locked until then",
	})
}

// VerifyEmail consumes a verification token. Returns 204 on success or 410
// for any invalid/expired/already-consumed token — one response shape to
// avoid leaking whether the token was known-but-expired vs never-existed.
func (h *SignupHandler) VerifyEmail(c *fiber.Ctx) error {
	var req struct {
		Token string `json:"token" validate:"required,min=16"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	if err := h.validate.Struct(req); err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": formatValidationErrors(err)})
	}

	if err := h.svc.VerifyEmail(c.Context(), req.Token); err != nil {
		if errors.Is(err, repository.ErrVerificationTokenNotFound) {
			return c.Status(fiber.StatusGone).JSON(fiber.Map{
				"error":   "invalid_or_expired",
				"message": "this verification link is invalid or has already been used",
			})
		}
		h.log.Error().Err(err).Msg("verify-email failed")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
	}
	return c.SendStatus(fiber.StatusNoContent)
}

// ResendVerification always returns 202. The handler never reveals whether
// the email exists in the system — enumeration-resistance per the plan.
func (h *SignupHandler) ResendVerification(c *fiber.Ctx) error {
	var req struct {
		Email string `json:"email" validate:"required,email,max=255"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	if err := h.validate.Struct(req); err != nil {
		// Even validation failures return 202 — an attacker shouldn't learn
		// "this email is malformed" through a different status than "this
		// email doesn't exist". But we DO log at debug for operators.
		h.log.Debug().Err(err).Msg("resend: validation failed, returning 202 anyway")
		return c.SendStatus(fiber.StatusAccepted)
	}

	// Fire-and-log. Outcome never surfaces to the caller.
	h.svc.ResendVerification(c.Context(), req.Email)
	return c.SendStatus(fiber.StatusAccepted)
}
