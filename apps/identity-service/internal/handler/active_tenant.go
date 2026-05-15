// Package handler — active_tenant.go
//
// Phase 5 endpoints:
//
//	GET   /auth/session/memberships    → list every tenant the user belongs to
//	PATCH /auth/session/active-tenant  → switch the session's active tenant
//
// Both require SessionCookieAuth (the picker is a browser-facing flow; no
// PASETO bearer token). The middleware populates `user_id`, `session_id`,
// `tenant_id` (live), and `anchor_tenant_id` (login-time) on c.Locals.
package handler

import (
	"errors"

	"github.com/go-playground/validator/v10"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/rs/zerolog"

	"github.com/wave-connect/sso-platform/apps/identity-service/internal/service"
)

type ActiveTenantHandler struct {
	svc      *service.ActiveTenantService
	validate *validator.Validate
	log      zerolog.Logger
}

func NewActiveTenantHandler(svc *service.ActiveTenantService, validate *validator.Validate, log zerolog.Logger) *ActiveTenantHandler {
	return &ActiveTenantHandler{
		svc:      svc,
		validate: validate,
		log:      log.With().Str("component", "active_tenant_handler").Logger(),
	}
}

// ListMemberships handles GET /auth/session/memberships.
//
//	@Summary	List user tenant memberships
//	@Tags		session
//	@Produce	json
//	@Success	200	{object}	map[string]any
//	@Router		/auth/session/memberships [get]
func (h *ActiveTenantHandler) ListMemberships(c *fiber.Ctx) error {
	userID, ok := c.Locals("user_id").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not authenticated"})
	}
	activeTenantID, _ := c.Locals("tenant_id").(uuid.UUID)

	memberships, err := h.svc.ListMemberships(c.Context(), userID, activeTenantID)
	if err != nil {
		h.log.Error().Err(err).Msg("list memberships failed")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
	}
	return c.JSON(fiber.Map{
		"memberships":      memberships,
		"active_tenant_id": activeTenantID,
	})
}

// SwitchActiveTenantRequest is the PATCH body.
type SwitchActiveTenantRequest struct {
	// TenantID is the raw UUID of the target tenant. Validators keep this
	// thin — the service layer enforces "user has membership in target."
	TenantID string `json:"tenant_id" validate:"required,uuid"`
}

// Rotate handles POST /auth/session/rotate — mints a fresh token set for
// the session's current active tenant, revoking the prior family so stale
// refresh tokens can't be replayed. Called by the UI immediately after a
// successful PATCH /auth/session/active-tenant so the user doesn't carry a
// stale-tenant access token for the remaining 15 min of its TTL.
// Rotate forces a refresh-token rotation on the current session.
//
//	@Summary	Rotate session tokens
//	@Tags		session
//	@Produce	json
//	@Success	200	{object}	map[string]any
//	@Router		/auth/session/rotate [post]
func (h *ActiveTenantHandler) Rotate(c *fiber.Ctx) error {
	userID, ok := c.Locals("user_id").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not authenticated"})
	}
	sessionID, ok := c.Locals("session_id").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "session context missing"})
	}
	tokens, err := h.svc.Rotate(c.Context(), sessionID, userID)
	if err != nil {
		if errors.Is(err, service.ErrRotateUnavailable) {
			return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "rotation disabled"})
		}
		if errors.Is(err, service.ErrTenantNotMember) {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "forbidden"})
		}
		h.log.Error().Err(err).Msg("rotate tokens failed")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
	}
	return c.JSON(tokens)
}

// SwitchActive handles PATCH /auth/session/active-tenant.
// SwitchActive pins the session to a different tenant the user belongs to.
//
//	@Summary	Switch active tenant
//	@Tags		session
//	@Accept		json
//	@Produce	json
//	@Param		body	body	map[string]string	true	"{ tenant_id: string }"
//	@Success	200		{object}	map[string]any
//	@Router		/auth/session/active-tenant [patch]
func (h *ActiveTenantHandler) SwitchActive(c *fiber.Ctx) error {
	userID, ok := c.Locals("user_id").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not authenticated"})
	}
	sessionID, ok := c.Locals("session_id").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "session context missing"})
	}

	var req SwitchActiveTenantRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	if err := h.validate.Struct(req); err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": formatValidationErrors(err)})
	}
	targetTenantID, err := uuid.Parse(req.TenantID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid tenant_id"})
	}

	if err := h.svc.SwitchActiveTenant(c.Context(), sessionID, userID, targetTenantID); err != nil {
		if errors.Is(err, service.ErrTenantNotMember) {
			// 403 rather than 404 — don't leak whether the target tenant
			// exists at all.
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error":   "not_a_member",
				"message": "you don't have a membership in that tenant",
			})
		}
		h.log.Error().Err(err).Msg("switch active tenant failed")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
	}
	// 200 with the new active tenant so the client can update any local
	// copy (e.g. X-Tenant-ID header) without a follow-up GET.
	return c.JSON(fiber.Map{"active_tenant_id": targetTenantID})
}
