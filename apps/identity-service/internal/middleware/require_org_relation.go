// Package middleware — require_org_relation.go
//
// ReBAC gate for routes scoped by a `:tenantId` path parameter. Expects a
// preceding auth middleware (SessionCookieAuth or PASETOAuth) to have
// populated c.Locals("user_id"). Looks up the path's tenantId, then calls
// authz-service's Check RPC to confirm the user holds the required relation
// on `organization:<tenantId>`.
//
// Design:
//   - Fail open ONLY on malformed requests (bad UUID → 400). Every other
//     failure mode (authz-service down, bad locals, RPC error, denied) returns
//     an appropriate 4xx/5xx without letting the handler execute.
//   - `relation` is a string so callers can pick the right gate (e.g.
//     `authz.RelAdmin` for migration admin, `authz.RelOwner` for destructive
//     ops).
package middleware

import (
	"errors"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/wave-connect/sso-platform/apps/identity-service/internal/authz"
)

// RequireOrgRelation gates handlers behind a ReBAC Check on the `:tenantId`
// path param. The previous middleware must have populated c.Locals("user_id").
//
// Responses:
//   403 not_member           — Check returned allowed=false
//   400 invalid path         — :tenantId missing or not a UUID
//   500 internal_auth        — locals not populated (programmer error)
//   503 authz_unavailable    — client wasn't configured at boot
//   502 authz_rpc_failed     — RPC call failed (network / grpc error)
func RequireOrgRelation(client *authz.Client, relation string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		rawUser := c.Locals("user_id")
		userID, ok := rawUser.(uuid.UUID)
		if !ok {
			// Programmer error: RequireOrgRelation was registered without a
			// preceding auth middleware. Surface as 500 so the bug is loud.
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "user context missing"})
		}

		tenantParam := c.Params("tenantId")
		tenantID, err := uuid.Parse(tenantParam)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid tenant id"})
		}

		allowed, err := client.CheckOrgRelation(c.Context(), userID, tenantID, relation)
		if err != nil {
			if errors.Is(err, authz.ErrAuthzUnavailable) {
				return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
					"error":   "authz_unavailable",
					"message": "authorization service is not configured",
				})
			}
			return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{
				"error":   "authz_rpc_failed",
				"message": "authorization check could not be completed",
			})
		}
		if !allowed {
			// 403 body is deliberately generic — we don't leak whether the
			// user is a non-admin member vs. a complete stranger to the org.
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error":   "forbidden",
				"message": "you don't have permission to act on this tenant",
			})
		}
		return c.Next()
	}
}
