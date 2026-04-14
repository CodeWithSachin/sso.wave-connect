package middleware

import (
	"context"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

const HeaderTenantID = "X-Tenant-ID"

// TenantExtraction reads the tenant from the X-Tenant-ID header (or falls back to the
// token claims set by the auth middleware). It also sets the RLS variable via SET LOCAL.
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

		tenantID, err := uuid.Parse(tenantStr)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "invalid tenant ID format",
			})
		}

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
