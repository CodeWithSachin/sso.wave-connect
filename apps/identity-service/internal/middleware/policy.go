package middleware

import (
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/rs/zerolog"

	"github.com/wave-connect/sso-platform/apps/identity-service/internal/service"
)

// TenantPolicyEnforcement loads the tenant policy and enforces IP allowlist
// and require-SSO restrictions. It stores the policy in Locals for downstream
// handlers to enforce field-level rules (password length, email domain, etc.).
func TenantPolicyEnforcement(policySvc *service.PolicyService, log zerolog.Logger) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tenantID, ok := c.Locals("tenant_id").(uuid.UUID)
		if !ok {
			// No tenant context yet — skip policy enforcement
			return c.Next()
		}

		policy, err := policySvc.GetPolicy(c.Context(), tenantID)
		if err != nil {
			log.Error().Err(err).Str("tenant_id", tenantID.String()).Msg("failed to load tenant policy")
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
		}

		// Store policy in Locals for handlers
		c.Locals("tenant_policy", policy)

		// IP allowlist enforcement
		if !policy.IsIPAllowed(c.IP()) {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error":   "ip_not_allowed",
				"message": "your IP address is not in the organization's allowlist",
			})
		}

		// Require SSO enforcement — block password-based endpoints
		if policy.RequireSSO {
			path := c.Path()
			if path == "/auth/login" || path == "/auth/register" {
				return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
					"error":   "sso_required",
					"message": "this organization requires SSO login; password authentication is disabled",
				})
			}
		}

		return c.Next()
	}
}
