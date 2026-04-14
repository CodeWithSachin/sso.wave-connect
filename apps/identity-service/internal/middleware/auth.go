package middleware

import (
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/wave-connect/sso-platform/apps/identity-service/internal/service"
)

// PASETOAuth extracts and decrypts a v4.local access token from the Authorization header,
// then stores the claims in Fiber locals for downstream handlers.
func PASETOAuth(tokenSvc *service.TokenService) fiber.Handler {
	return func(c *fiber.Ctx) error {
		auth := c.Get("Authorization")
		if auth == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "missing authorization header",
			})
		}

		if !strings.HasPrefix(auth, "Bearer ") {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "invalid authorization format",
			})
		}

		tokenStr := strings.TrimPrefix(auth, "Bearer ")

		tenantID, ok := c.Locals("tenant_id").(uuid.UUID)
		if !ok {
			// Try parsing from header directly for routes where tenant middleware runs first
			tenantStr := c.Get(HeaderTenantID)
			if tenantStr == "" {
				return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
					"error": "tenant context required for authentication",
				})
			}
			var err error
			tenantID, err = uuid.Parse(tenantStr)
			if err != nil {
				return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
					"error": "invalid tenant ID",
				})
			}
			c.Locals("tenant_id", tenantID)
		}

		claims, err := tokenSvc.DecryptAccessToken(c.Context(), tokenStr, tenantID)
		if err != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "invalid or expired token",
			})
		}

		c.Locals("user_id", claims.Subject)
		c.Locals("tenant_id", claims.TenantID)
		c.Locals("email", claims.Email)
		c.Locals("scopes", claims.Scopes)
		c.Locals("jti", claims.JTI)

		return c.Next()
	}
}
