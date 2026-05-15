// Package handler — signup_org.go
//
// Phase 2 HTTP surface:
//
//	POST /auth/public/signup-org                      → 201 + sso cookie + TXT instrs
//	POST /tenants/:tenantId/domains                   → 201 (auth'd via PASETO) — add another domain
//	POST /tenants/:tenantId/domains/:domainId/verify  → 200 { outcome: "..." }
//	GET  /tenants/:tenantId/domains                   → list claims
//	DELETE /tenants/:tenantId/domains/:domainId       → soft-delete claim
//
// The signup-org endpoint is registered OUTSIDE the tenant-extraction group
// (same pattern as /auth/public/signup in Phase 1). The domain management
// endpoints run under `protected` (PASETO-authenticated) because they need
// an authorized tenant context.
package handler

import (
	"errors"

	"github.com/go-playground/validator/v10"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/rs/zerolog"

	"github.com/wave-connect/sso-platform/apps/identity-service/internal/config"
	dnsresolver "github.com/wave-connect/sso-platform/apps/identity-service/internal/dns"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/id"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/repository"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/service"
)

// SignupOrgHandler is the public-signup half: one endpoint that creates the
// org + admin + pending claim. Domain management post-signup lives in the
// sibling DomainsHandler.
type SignupOrgHandler struct {
	svc       *service.SignupOrgService
	validate  *validator.Validate
	log       zerolog.Logger
	cookieCfg config.CookieConfig
}

// NewSignupOrgHandler ties deps together.
func NewSignupOrgHandler(
	svc *service.SignupOrgService,
	validate *validator.Validate,
	log zerolog.Logger,
	cookieCfg config.CookieConfig,
) *SignupOrgHandler {
	return &SignupOrgHandler{
		svc:       svc,
		validate:  validate,
		log:       log.With().Str("component", "signup_org_handler").Logger(),
		cookieCfg: cookieCfg,
	}
}

// SignupOrg creates the tenant + admin + pending domain claim. On success:
// sets the sso_session cookie and returns 201 with the TXT instructions the
// UI needs for the next step.
//
//	@Summary	Organisation signup with domain claim
//	@Tags		signup
//	@Accept		json
//	@Produce	json
//	@Param		body	body		service.SignupOrgRequest	true	"Org signup payload"
//	@Success	201		{object}	map[string]any
//	@Failure	400		{object}	map[string]string
//	@Failure	409		{object}	map[string]string
//	@Router		/auth/public/signup-org [post]
func (h *SignupOrgHandler) SignupOrg(c *fiber.Ctx) error {
	var req service.SignupOrgRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	if err := h.validate.Struct(req); err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": formatValidationErrors(err)})
	}

	result, err := h.svc.SignupOrg(c.Context(), req, c.IP(), c.Get("User-Agent"))
	if err != nil {
		switch {
		case errors.Is(err, service.ErrEmailTaken):
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "email already registered"})
		case errors.Is(err, service.ErrSlugTaken):
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "slug already taken", "field": "org_slug"})
		case errors.Is(err, service.ErrDomainAlreadyClaimed):
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{
				"error":   "domain_already_claimed",
				"message": "this domain is already verified by another workspace",
				"field":   "domain",
			})
		case errors.Is(err, service.ErrDomainEmailMismatch):
			return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{
				"error":   "domain_email_mismatch",
				"message": "admin email must end with @<domain> — you can't claim a domain you don't use",
				"field":   "email",
			})
		case errors.Is(err, dnsresolver.ErrNotETLD1):
			return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{
				"error":   "domain_not_etld1",
				"message": "claim the root domain (e.g. acme.com), not a subdomain",
				"field":   "domain",
			})
		case errors.Is(err, dnsresolver.ErrInvalidDomain):
			return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{
				"error":   "invalid_domain",
				"message": "enter a valid domain (letters, digits, dots, hyphens only; no wildcards or unicode)",
				"field":   "domain",
			})
		default:
			h.log.Error().Err(err).Msg("signup-org failed")
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
		}
	}

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
		"session_id": id.Format(id.PrefixSession, result.Session.ID),
		"domain": fiber.Map{
			"id":         result.DomainRow.ID.String(),
			"domain":     result.DomainRow.Domain,
			"status":     result.DomainRow.Status,
			"expires_at": result.DomainRow.ExpiresAt,
		},
		"dns_instructions": result.TXTRecord,
	})
}

// DomainsHandler handles post-signup domain management. Gated by
// SessionCookieAuth (browser-facing), with an additional check that the
// `:tenantId` URL parameter matches the session's tenant — otherwise a user
// with sessions in multiple tenants could pastes the wrong workspace URL and
// silently act on the session's actual tenant.
type DomainsHandler struct {
	svc            *service.DomainVerifyService
	membershipRepo *repository.MembershipRepository
	validate       *validator.Validate
	log            zerolog.Logger
}

// NewDomainsHandler wires deps. MembershipRepo is consulted for role-based
// gating (see `resolveRole`).
func NewDomainsHandler(
	svc *service.DomainVerifyService,
	membershipRepo *repository.MembershipRepository,
	validate *validator.Validate,
	log zerolog.Logger,
) *DomainsHandler {
	return &DomainsHandler{
		svc:            svc,
		membershipRepo: membershipRepo,
		validate:       validate,
		log:            log.With().Str("component", "domains_handler").Logger(),
	}
}

// resolveTenantScope validates that the `:tenantId` URL param matches the
// session's tenant and returns the tenant UUID. Accepts either a raw UUID or
// a typeid-prefixed form (ten_…). Rejects cross-tenant URLs with 403.
//
// Phase 2 review fix #1.
func (h *DomainsHandler) resolveTenantScope(c *fiber.Ctx) (uuid.UUID, error) {
	sessionTenant, ok := c.Locals("tenant_id").(uuid.UUID)
	if !ok {
		return uuid.Nil, c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not authenticated"})
	}
	raw := c.Params("tenantId")
	if raw == "" {
		// Route misconfiguration — shouldn't happen with current registration.
		return sessionTenant, nil
	}
	// Try typeid first, then raw UUID.
	parsed, _, err := id.Parse(raw)
	if err != nil {
		parsed, err = uuid.Parse(raw)
		if err != nil {
			return uuid.Nil, c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid tenant id"})
		}
	}
	if parsed != sessionTenant {
		h.log.Warn().
			Str("url_tenant", raw).
			Str("session_tenant", sessionTenant.String()).
			Msg("domain endpoint: URL tenant mismatch")
		return uuid.Nil, c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"error":   "tenant_scope_mismatch",
			"message": "URL tenant does not match your session",
		})
	}
	return sessionTenant, nil
}

// resolveRole looks up the caller's role in the scoped tenant. Returns the
// role string + nil on success; writes an HTTP response and returns a
// sentinel on error. Used by mutating endpoints to require owner/admin.
//
// Phase 2 review fix #5.
func (h *DomainsHandler) resolveRole(c *fiber.Ctx, tenantID uuid.UUID) (string, error) {
	userID, ok := c.Locals("user_id").(uuid.UUID)
	if !ok {
		return "", c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not authenticated"})
	}
	m, err := h.membershipRepo.GetByUserAndTenant(c.Context(), userID, tenantID)
	if err != nil {
		return "", c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "not a member of this tenant"})
	}
	return m.Role, nil
}

// List returns all claims (pending + verified + expired) for the caller's tenant.
//
// Phase 2 review fix #5: `verification_token` is only returned for pending
// rows AND only when the caller is owner/admin. Verified rows never include
// the token (it's no longer useful), and member/readonly callers get a
// redacted response even for pending rows.
// List returns the verified and pending domains for a tenant.
//
//	@Summary	List tenant domains
//	@Tags		domains
//	@Produce	json
//	@Param		tenantId	path	string	true	"Tenant ID"
//	@Success	200			{array}	map[string]any
//	@Router		/tenants/{tenantId}/domains [get]
func (h *DomainsHandler) List(c *fiber.Ctx) error {
	tenantID, err := h.resolveTenantScope(c)
	if err != nil {
		return err
	}
	role, err := h.resolveRole(c, tenantID)
	if err != nil {
		return err
	}
	canSeeToken := role == "owner" || role == "admin"

	rows, err := h.svc.ListForTenant(c.Context(), tenantID)
	if err != nil {
		h.log.Error().Err(err).Msg("list domains")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
	}

	out := make([]fiber.Map, len(rows))
	for i, r := range rows {
		item := fiber.Map{
			"id":                  r.ID.String(),
			"domain":              r.Domain,
			"status":              r.Status,
			"is_primary":          r.IsPrimary,
			"verification_method": r.VerificationMethod,
			"verified_at":         r.VerifiedAt,
			"last_checked_at":     r.LastCheckedAt,
			"check_attempts":      r.CheckAttempts,
			"expires_at":          r.ExpiresAt,
			"created_at":          r.CreatedAt,
		}
		if canSeeToken && r.Status == "pending" {
			item["verification_token"] = r.VerificationToken
		}
		out[i] = item
	}
	return c.JSON(fiber.Map{"domains": out, "role": role})
}

// Add starts a new claim for the caller's tenant. Owner/admin only.
// Add claims an additional domain for the tenant, returning DNS TXT instructions.
//
//	@Summary	Add a tenant domain
//	@Tags		domains
//	@Accept		json
//	@Produce	json
//	@Param		tenantId	path		string				true	"Tenant ID"
//	@Param		body		body		map[string]string	true	"{ domain: string }"
//	@Success	201			{object}	map[string]any
//	@Router		/tenants/{tenantId}/domains [post]
func (h *DomainsHandler) Add(c *fiber.Ctx) error {
	tenantID, err := h.resolveTenantScope(c)
	if err != nil {
		return err
	}
	role, err := h.resolveRole(c, tenantID)
	if err != nil {
		return err
	}
	if role != "owner" && role != "admin" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "owner or admin role required"})
	}
	userID, _ := c.Locals("user_id").(uuid.UUID)

	var req struct {
		Domain string `json:"domain" validate:"required,min=4,max=255"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	if err := h.validate.Struct(req); err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": formatValidationErrors(err)})
	}

	row, err := h.svc.AddDomain(c.Context(), tenantID, userID, req.Domain, 0)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrDomainAlreadyClaimed):
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{
				"error":   "domain_already_claimed",
				"message": "this domain is already verified by another workspace",
			})
		default:
			h.log.Warn().Err(err).Msg("add domain")
			return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": err.Error()})
		}
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"id":                  row.ID.String(),
		"domain":              row.Domain,
		"status":              row.Status,
		"verification_method": row.VerificationMethod,
		"verification_token":  row.VerificationToken,
		"expires_at":          row.ExpiresAt,
	})
}

// Verify runs a single on-demand verification attempt. Owner/admin only.
// Verify forces a DNS TXT check for a pending domain claim.
//
//	@Summary	Verify a tenant domain
//	@Tags		domains
//	@Produce	json
//	@Param		tenantId	path		string	true	"Tenant ID"
//	@Param		id			path		string	true	"Domain ID"
//	@Success	200			{object}	map[string]any
//	@Router		/tenants/{tenantId}/domains/{id}/verify [post]
func (h *DomainsHandler) Verify(c *fiber.Ctx) error {
	tenantID, err := h.resolveTenantScope(c)
	if err != nil {
		return err
	}
	role, err := h.resolveRole(c, tenantID)
	if err != nil {
		return err
	}
	if role != "owner" && role != "admin" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "owner or admin role required"})
	}

	domainIDStr := c.Params("id")
	domainID, err := uuid.Parse(domainIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid domain id"})
	}

	outcome, err := h.svc.VerifyOne(c.Context(), tenantID, domainID)
	if err != nil {
		if errors.Is(err, repository.ErrTenantDomainNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "domain not found"})
		}
		h.log.Error().Err(err).Msg("verify domain")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
	}

	return c.JSON(fiber.Map{"outcome": string(outcome)})
}

// Delete soft-deletes a pending domain claim. Owner/admin only.
// Verified claims can also be released this way — the partial unique index
// on (domain) WHERE status='verified' is scoped to non-deleted rows, so
// soft-deleting frees the domain for another tenant to claim.
//
// Phase 2 review fix #7.
// Delete removes a domain claim from the tenant.
//
//	@Summary	Delete a tenant domain
//	@Tags		domains
//	@Param		tenantId	path	string	true	"Tenant ID"
//	@Param		id			path	string	true	"Domain ID"
//	@Success	204
//	@Router		/tenants/{tenantId}/domains/{id} [delete]
func (h *DomainsHandler) Delete(c *fiber.Ctx) error {
	tenantID, err := h.resolveTenantScope(c)
	if err != nil {
		return err
	}
	role, err := h.resolveRole(c, tenantID)
	if err != nil {
		return err
	}
	if role != "owner" && role != "admin" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "owner or admin role required"})
	}

	domainIDStr := c.Params("id")
	domainID, err := uuid.Parse(domainIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid domain id"})
	}

	if err := h.svc.SoftDelete(c.Context(), tenantID, domainID); err != nil {
		if errors.Is(err, repository.ErrTenantDomainNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "domain not found"})
		}
		h.log.Error().Err(err).Msg("delete domain")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
	}
	return c.SendStatus(fiber.StatusNoContent)
}
