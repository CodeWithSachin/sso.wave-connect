// Package handler — discover.go
//
// Phase 3 email-first login discovery. Single endpoint:
//
//	GET /auth/public/discover?email=<urlencoded>
//
// Returns `{mode, tenant?, sso?}`. Always 200 — even for malformed or
// non-existent domains — so the shape is enumeration-resistant (a 404 on
// unknown domain would confirm existence for the attacker). Service layer
// enforces the same invariant.
//
// Consumed by the login-portal's email-step to decide whether to show a
// password field, a tenant-branded password field, or redirect to an SSO
// provider.
package handler

import (
	"github.com/go-playground/validator/v10"
	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog"

	"github.com/wave-connect/sso-platform/apps/identity-service/internal/service"
)

type DiscoverHandler struct {
	svc      *service.DiscoverService
	validate *validator.Validate
	log      zerolog.Logger
}

func NewDiscoverHandler(svc *service.DiscoverService, validate *validator.Validate, log zerolog.Logger) *DiscoverHandler {
	return &DiscoverHandler{
		svc:      svc,
		validate: validate,
		log:      log.With().Str("component", "discover_handler").Logger(),
	}
}

// Discover handles GET /auth/public/discover?email=...
//
// Query param `email` is required — the service is tolerant to a raw domain
// too (anything after the last `@`), but we prefer the email form so caching
// always happens on the domain part not a trailing-slashed raw input.
// Discover routes a login email to consumer/IdP/portal based on tenant claim.
//
//	@Summary	Discover login mode
//	@Tags		signup
//	@Produce	json
//	@Param		email	query		string	true	"Email or domain"
//	@Success	200		{object}	map[string]any
//	@Router		/auth/public/discover [get]
func (h *DiscoverHandler) Discover(c *fiber.Ctx) error {
	email := c.Query("email")
	if email == "" {
		// Neutral response — same shape as "domain unknown". Keeps probing
		// for endpoint existence indistinguishable from probing for emails.
		return c.JSON(fiber.Map{"mode": service.DiscoverModeConsumer})
	}

	result, err := h.svc.Discover(c.Context(), email)
	if err != nil {
		// Service is documented to never return err — this branch is defensive.
		h.log.Warn().Err(err).Msg("discover failed")
		return c.JSON(fiber.Map{"mode": service.DiscoverModeConsumer})
	}

	resp := fiber.Map{"mode": result.Mode}
	if result.Tenant != nil {
		resp["tenant"] = result.Tenant
	}
	if result.SSO != nil {
		resp["sso"] = result.SSO
	}
	return c.JSON(resp)
}
