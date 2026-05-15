// Package handler — migration.go
//
// Phase 4 post-claim migration endpoints. Two surfaces:
//
//	Public (tenantless, token-scoped):
//	  POST /auth/public/migration/:token/accept    → 204 on success
//	  POST /auth/public/migration/:token/decline   → 204 on success
//	  GET  /auth/public/migration/:token           → 200 with a safe subset
//	                                                 of the offer for the UI
//
//	Admin (session-cookie scoped to owner of to_tenant):
//	  POST /tenants/:tenantId/migrations/:id/notify-force  → 202
//	  POST /tenants/:tenantId/migrations/:id/force         → 204
//
// Public endpoints never reveal the user's identity on a bad token —
// returning the same 410-shaped body for all failure modes (expired /
// invalid / already-resolved) prevents enumerating valid migrations.
package handler

import (
	"errors"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog"

	"github.com/wave-connect/sso-platform/apps/identity-service/internal/repository"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/service"
)

// MigrationHandler wraps MigrationService for the public accept/decline
// routes and the admin force routes. Carries a pool only for the one-off
// user-email lookup needed by the force-notice path; the rest of the state
// lives in the service/repo.
type MigrationHandler struct {
	svc  *service.MigrationService
	repo *repository.TenantDomainMigrationRepository
	pool *pgxpool.Pool
	log  zerolog.Logger
}

// NewMigrationHandler wires deps.
func NewMigrationHandler(svc *service.MigrationService, repo *repository.TenantDomainMigrationRepository, pool *pgxpool.Pool, log zerolog.Logger) *MigrationHandler {
	return &MigrationHandler{
		svc:  svc,
		repo: repo,
		pool: pool,
		log:  log.With().Str("component", "migration_handler").Logger(),
	}
}

// ── public routes ───────────────────────────────────────────────────────────

// Lookup returns the minimum info the login-portal needs to render the
// accept/decline page: domain, org display name, and expiry. Does NOT
// return user_id, email, or raw tenant UUIDs — the URL's token is already
// bound to a specific user, and the UI has no legitimate need for the org's
// internal ID (which would be a defense-in-depth info-disclosure).
// Lookup returns metadata for a pending user-migration offer.
//
//	@Summary	Look up a migration offer
//	@Tags		migration
//	@Produce	json
//	@Param		token	path		string	true	"Migration token"
//	@Success	200		{object}	map[string]any
//	@Router		/auth/public/migration/{token} [get]
func (h *MigrationHandler) Lookup(c *fiber.Ctx) error {
	token := c.Params("token")
	if token == "" {
		return migrationGone(c)
	}
	row, err := h.repo.GetByToken(c.Context(), token)
	if err != nil {
		return migrationGone(c)
	}
	// Resolve the target org's display name for the UI. Best-effort — a
	// missing tenant row would be a data bug, but we shouldn't 410 here
	// because the migration itself is valid; fall back to the domain.
	orgName := row.Domain
	var displayName *string
	_ = h.pool.QueryRow(c.Context(),
		`SELECT display_name FROM tenants WHERE id = $1 AND deleted_at IS NULL`,
		row.ToTenantID,
	).Scan(&displayName)
	if displayName != nil && *displayName != "" {
		orgName = *displayName
	}
	return c.JSON(fiber.Map{
		"id":              row.ID,
		"domain":          row.Domain,
		"organization":    orgName,
		"status":          row.Status,
		"expires_at":      row.ExpiresAt,
		"offered_at":      row.OfferedAt,
	})
}

// Accept consumes the token and runs MigrationService.Accept.
// Accept consumes the migration token and moves the user to the new tenant.
//
//	@Summary	Accept a migration
//	@Tags		migration
//	@Param		token	path	string	true	"Migration token"
//	@Success	200		{object}	map[string]any
//	@Router		/auth/public/migration/{token}/accept [post]
func (h *MigrationHandler) Accept(c *fiber.Ctx) error {
	token := c.Params("token")
	if token == "" {
		return migrationGone(c)
	}
	if _, err := h.svc.Accept(c.Context(), token); err != nil {
		return h.mapPublicErr(c, err)
	}
	// 204 — the caller's cookie (if any) is now stale because the accept
	// path revokes all sessions. Login-portal redirects the user to /login
	// after a successful accept.
	return c.SendStatus(fiber.StatusNoContent)
}

// Decline consumes the token and flips status=declined.
// Decline rejects the migration offer.
//
//	@Summary	Decline a migration
//	@Tags		migration
//	@Param		token	path	string	true	"Migration token"
//	@Success	204
//	@Router		/auth/public/migration/{token}/decline [post]
func (h *MigrationHandler) Decline(c *fiber.Ctx) error {
	token := c.Params("token")
	if token == "" {
		return migrationGone(c)
	}
	if _, err := h.svc.Decline(c.Context(), token); err != nil {
		return h.mapPublicErr(c, err)
	}
	return c.SendStatus(fiber.StatusNoContent)
}

// ── admin routes ────────────────────────────────────────────────────────────

// NotifyForce sends the 7-day heads-up email for a pending/declined/expired
// migration. Handler requires the caller to hold an owner membership on
// `row.ToTenantID`; enforcement lives in the session-cookie-guarded route
// registration (see main.go).
// NotifyForce alerts a target user that a force-migration is about to happen.
//
//	@Summary	Notify pending force-migration
//	@Tags		migration
//	@Security	BearerAuth
//	@Param		tenantId	path	string	true	"Tenant ID"
//	@Param		id			path	string	true	"Migration ID"
//	@Success	204
//	@Router		/tenants/{tenantId}/migrations/{id}/notify-force [post]
func (h *MigrationHandler) NotifyForce(c *fiber.Ctx) error {
	tenantID, migrationID, ok := h.parseTenantAndMigration(c)
	if !ok {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid path"})
	}
	row, err := h.repo.GetByID(c.Context(), migrationID)
	if err != nil {
		if errors.Is(err, repository.ErrMigrationNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found"})
		}
		h.log.Error().Err(err).Msg("get migration failed")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
	}
	if row.ToTenantID != tenantID {
		// Migration belongs to a different org — treat as 404 so we don't
		// disclose its existence across tenant boundaries.
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found"})
	}
	userEmail, _ := h.lookupUserEmail(c, row.UserID)
	if _, err := h.svc.NotifyForce(c.Context(), row.ID, userEmail); err != nil {
		return h.mapAdminErr(c, err)
	}
	return c.SendStatus(fiber.StatusAccepted)
}

// Force performs the actual force-move. Guarded the same way as NotifyForce.
// The actor (admin invoking this) comes from c.Locals("user_id"), populated
// by SessionCookieAuth upstream — threaded to the service so the outbox
// tuple + audit event name the admin, not the migrated user.
// Force completes an admin-initiated migration without user confirmation.
//
//	@Summary	Force a migration
//	@Tags		migration
//	@Security	BearerAuth
//	@Param		tenantId	path	string	true	"Tenant ID"
//	@Param		id			path	string	true	"Migration ID"
//	@Success	200	{object}	map[string]any
//	@Router		/tenants/{tenantId}/migrations/{id}/force [post]
func (h *MigrationHandler) Force(c *fiber.Ctx) error {
	tenantID, migrationID, ok := h.parseTenantAndMigration(c)
	if !ok {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid path"})
	}
	actorID, ok := c.Locals("user_id").(uuid.UUID)
	if !ok {
		// SessionCookieAuth should have populated this; surface as 500 so
		// the wiring bug is loud rather than silently attributing to nil.
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "user context missing"})
	}
	row, err := h.repo.GetByID(c.Context(), migrationID)
	if err != nil {
		if errors.Is(err, repository.ErrMigrationNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found"})
		}
		h.log.Error().Err(err).Msg("get migration failed")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
	}
	if row.ToTenantID != tenantID {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found"})
	}
	if _, err := h.svc.Force(c.Context(), row.ID, actorID); err != nil {
		return h.mapAdminErr(c, err)
	}
	return c.SendStatus(fiber.StatusNoContent)
}

// List returns all migrations targeting a tenant — for the admin dashboard.
// List returns pending migrations for a tenant. Admin only.
//
//	@Summary	List tenant migrations
//	@Tags		migration
//	@Security	BearerAuth
//	@Param		tenantId	path		string	true	"Tenant ID"
//	@Success	200			{array}		map[string]any
//	@Router		/tenants/{tenantId}/migrations [get]
func (h *MigrationHandler) List(c *fiber.Ctx) error {
	tenantID, err := uuid.Parse(c.Params("tenantId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid tenant id"})
	}
	rows, err := h.repo.ListByToOrg(c.Context(), tenantID)
	if err != nil {
		h.log.Error().Err(err).Msg("list migrations failed")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
	}
	out := make([]fiber.Map, 0, len(rows))
	for _, r := range rows {
		out = append(out, fiber.Map{
			"id":                r.ID,
			"user_id":           r.UserID,
			"from_tenant_id":    r.FromTenantID,
			"domain":            r.Domain,
			"status":            r.Status,
			"offered_at":        r.OfferedAt,
			"responded_at":      r.RespondedAt,
			"expires_at":        r.ExpiresAt,
			"force_notified_at": r.ForceNotifiedAt,
		})
	}
	return c.JSON(fiber.Map{"migrations": out})
}

// ── helpers ─────────────────────────────────────────────────────────────────

// parseTenantAndMigration reads the two UUIDs from the admin path. Both
// must be valid UUIDs; anything else yields (_, _, false).
func (h *MigrationHandler) parseTenantAndMigration(c *fiber.Ctx) (uuid.UUID, uuid.UUID, bool) {
	tenantID, err := uuid.Parse(c.Params("tenantId"))
	if err != nil {
		return uuid.Nil, uuid.Nil, false
	}
	migrationID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return uuid.Nil, uuid.Nil, false
	}
	return tenantID, migrationID, true
}

// lookupUserEmail returns the migration's target user email for the force-
// notice email. Best-effort — failure just means the notice email can't
// send (the flow still marks force_notified_at and logs). Nil-safe.
func (h *MigrationHandler) lookupUserEmail(c *fiber.Ctx, userID uuid.UUID) (string, error) {
	const q = `SELECT email FROM users WHERE id = $1 AND deleted_at IS NULL`
	var email string
	if err := h.pool.QueryRow(c.Context(), q, userID).Scan(&email); err != nil {
		return "", err
	}
	return email, nil
}

// mapPublicErr translates service-layer errors into public-facing HTTP
// responses. Conflates expiry / invalid-token / already-resolved into a
// single 410 so attackers can't enumerate which tokens were ever valid.
func (h *MigrationHandler) mapPublicErr(c *fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, repository.ErrMigrationNotFound),
		errors.Is(err, service.ErrMigrationExpired),
		errors.Is(err, service.ErrMigrationAlreadyResolved):
		return migrationGone(c)
	default:
		h.log.Error().Err(err).Msg("migration op failed")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
	}
}

// mapAdminErr keeps distinct error shapes because admin tooling needs to
// distinguish "not eligible to force yet" from "notice window not elapsed"
// to render the right UI.
func (h *MigrationHandler) mapAdminErr(c *fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, service.ErrMigrationAlreadyResolved):
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "already_resolved"})
	case errors.Is(err, service.ErrMigrationNotForcible):
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "not_eligible_for_force"})
	case errors.Is(err, service.ErrForceNoticeTooRecent):
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "notice_window_not_elapsed"})
	case errors.Is(err, repository.ErrMigrationNotFound):
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found"})
	default:
		h.log.Error().Err(err).Msg("admin migration op failed")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
	}
}

// migrationGone is the unified "token not usable" response.
func migrationGone(c *fiber.Ctx) error {
	return c.Status(fiber.StatusGone).JSON(fiber.Map{
		"error":   "migration_unavailable",
		"message": "this migration link is no longer valid",
	})
}
