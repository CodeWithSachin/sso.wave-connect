package middleware

import (
	"context"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/wave-connect/sso-platform/apps/identity-service/internal/id"
)

const HeaderTenantID = "X-Tenant-ID"

// TenantExtraction reads the tenant from the X-Tenant-ID header (or falls back to the
// token claims set by the auth middleware). It also sets the RLS variable via SET LOCAL.
//
// Accepts either a raw uuid (`5f5b…`) or the typeid-prefixed form (`ten_…`) so
// the same value returned by /auth/public/discover and /auth/public/signup-org
// can be sent back unmodified by clients.
func TenantExtraction(pool *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tenantStr := c.Get(HeaderTenantID)

		// Fall back to tenant from token claims (set by auth middleware)
		if tenantStr == "" {
			if tid, ok := c.Locals("tenant_id").(uuid.UUID); ok {
				tenantStr = tid.String()
			}
		}

		if tenantStr == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "X-Tenant-ID header is required",
			})
		}

		tenantID, err := parseTenantID(tenantStr)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "invalid tenant ID format",
			})
		}
		tenantStr = tenantID.String()

		c.Locals("tenant_id", tenantID)

		// Set RLS context for this request's DB queries
		if pool != nil {
			conn, err := pool.Acquire(context.Background())
			if err == nil {
				_, _ = conn.Exec(context.Background(), "SELECT set_config('app.current_tenant_id', $1, true)", tenantStr)
				conn.Release()
			}
		}

		return c.Next()
	}
}

// parseTenantID accepts a raw uuid string or a typeid-prefixed tenant id
// (e.g. `ten_…`) and returns the underlying uuid.UUID. We accept both because
// /auth/public/discover and /auth/public/signup-org return the prefixed form
// in JSON, and clients commonly echo that value straight back into the header.
func parseTenantID(s string) (uuid.UUID, error) {
	if strings.HasPrefix(s, id.PrefixTenant+"_") {
		uid, _, err := id.Parse(s)
		return uid, err
	}
	return uuid.Parse(s)
}
