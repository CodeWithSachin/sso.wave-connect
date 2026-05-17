// Package handler — invitation.go
//
// Phase 6 public endpoints:
//
//	GET   /auth/public/invitation/:token         → offer metadata + UI flags
//	POST  /auth/public/invitation/:token/accept  → activate membership + session
//	POST  /auth/public/invitation/:token/decline → soft-delete membership
//
// All paths are tenantless + unauthenticated; the token itself is the
// capability. Rate-limited at the router layer (see main.go). Errors
// collapse into 410 for the public Lookup to resist enumeration of which
// tokens ever existed — mirrors the shape used by the Phase 4 migration
// endpoints.
package handler

import (
	"errors"

	"github.com/go-playground/validator/v10"
	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog"

	"github.com/wave-connect/sso-platform/apps/identity-service/internal/config"
	_ "github.com/wave-connect/sso-platform/apps/identity-service/internal/model" // referenced via swag annotations
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/repository"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/service"
)

// InvitationHandler routes token-scoped invitation requests to the service.
type InvitationHandler struct {
	svc       *service.InvitationService
	validate  *validator.Validate
	log       zerolog.Logger
	cookieCfg config.CookieConfig
}

// NewInvitationHandler wires the handler.
func NewInvitationHandler(svc *service.InvitationService, validate *validator.Validate, log zerolog.Logger, cookieCfg config.CookieConfig) *InvitationHandler {
	return &InvitationHandler{
		svc:       svc,
		validate:  validate,
		log:       log.With().Str("component", "invitation_handler").Logger(),
		cookieCfg: cookieCfg,
	}
}

// Lookup handles GET /auth/public/invitation/:token. Returns the minimal
// offer metadata the UI needs: tenant display name, role being offered,
// invited email, and whether the user needs to set a password.
//
//	@Summary	Look up an invitation
//	@Tags		invitation
//	@Produce	json
//	@Param		token	path		string	true	"Invitation token"
//	@Success	200		{object}	map[string]any
//	@Router		/auth/public/invitation/{token} [get]
func (h *InvitationHandler) Lookup(c *fiber.Ctx) error {
	token := c.Params("token")
	if token == "" {
		return invitationGone(c)
	}
	result, err := h.svc.Lookup(c.Context(), token)
	if err != nil {
		return h.mapPublicErr(c, err)
	}
	display := result.TenantDisplayName
	if display == "" {
		display = result.TenantName
	}
	return c.JSON(fiber.Map{
		"tenant_name":          display,
		"role":                 result.Role,
		"invited_email":        result.InvitedEmail,
		"needs_password_setup": result.NeedsPasswordSetup,
		"expires_at":           result.ExpiresAt,
	})
}

// Accept handles POST /auth/public/invitation/:token/accept. Body carries
// optional password + display_name (required iff needs_password_setup was
// true in Lookup). On success, sets the sso_session cookie and returns
// 204 — the UI then navigates to login-portal's post-auth landing.
// Accept consumes the invitation token and joins the user to the tenant.
//
//	@Summary	Accept an invitation
//	@Tags		invitation
//	@Accept		json
//	@Produce	json
//	@Param		token	path		string				true	"Invitation token"
//	@Param		body	body		model.AcceptInvitationRequest	true	"Optional password if a new user is being created"
//	@Success	200		{object}	model.AuthResponse
//	@Router		/auth/public/invitation/{token}/accept [post]
func (h *InvitationHandler) Accept(c *fiber.Ctx) error {
	token := c.Params("token")
	if token == "" {
		return invitationGone(c)
	}
	var req service.AcceptRequest
	// Empty body is valid for existing-user invites. BodyParser tolerates it.
	if err := c.BodyParser(&req); err != nil && c.Body() != nil && len(c.Body()) > 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	if err := h.validate.Struct(req); err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": formatValidationErrors(err)})
	}
	result, err := h.svc.Accept(c.Context(), token, req, c.IP(), c.Get("User-Agent"))
	if err != nil {
		return h.mapPublicErr(c, err)
	}

	// Set sso_session cookie so the invited user is logged in when they
	// land on /login. Nil session means SessionSvc.Create failed — we
	// still return 204 because the membership is live; user can log in
	// manually.
	if result.Session != nil {
		setSSOCookie(c, result.Session, h.cookieCfg)
	}
	return c.JSON(fiber.Map{
		"tenant_id":   result.TenantID,
		"tenant_name": result.TenantName,
		"user_id":     result.UserID,
	})
}

// Decline handles POST /auth/public/invitation/:token/decline.
// Decline rejects the invitation. Idempotent.
//
//	@Summary	Decline an invitation
//	@Tags		invitation
//	@Param		token	path	string	true	"Invitation token"
//	@Success	204
//	@Router		/auth/public/invitation/{token}/decline [post]
func (h *InvitationHandler) Decline(c *fiber.Ctx) error {
	token := c.Params("token")
	if token == "" {
		return invitationGone(c)
	}
	if err := h.svc.Decline(c.Context(), token); err != nil {
		return h.mapPublicErr(c, err)
	}
	return c.SendStatus(fiber.StatusNoContent)
}

// mapPublicErr collapses all invalid/expired/resolved/password-required
// errors into appropriate HTTP codes. 410 for the enumeration-resistant
// ones; 422 / 409 for the password shape errors the UI can recover from.
func (h *InvitationHandler) mapPublicErr(c *fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, repository.ErrInvitationNotFound),
		errors.Is(err, repository.ErrInvitationAlreadyResolved),
		errors.Is(err, repository.ErrInvitationExpired):
		return invitationGone(c)
	case errors.Is(err, service.ErrInvitationPasswordRequired):
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{
			"error":   "password_required",
			"message": "set a password to finish accepting the invitation",
		})
	case errors.Is(err, service.ErrInvitationPasswordNotAllowed):
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{
			"error":   "password_not_allowed",
			"message": "this account already has a password; don't pass one on accept",
		})
	default:
		h.log.Error().Err(err).Msg("invitation op failed")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
	}
}

// invitationGone is the enumeration-resistant "token not usable" reply.
// Same shape (410 + JSON body) as the Phase 4 migration endpoint's
// migrationGone helper to keep the UI's error-handling uniform.
func invitationGone(c *fiber.Ctx) error {
	return c.Status(fiber.StatusGone).JSON(fiber.Map{
		"error":   "invitation_unavailable",
		"message": "this invitation link is no longer valid",
	})
}
