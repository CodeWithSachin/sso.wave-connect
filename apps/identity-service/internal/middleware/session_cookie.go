// Package middleware — session_cookie.go
//
// Fiber middleware that validates the `sso_session` HttpOnly cookie and
// populates `c.Locals("user_id" / "tenant_id")` — same shape as PASETOAuth
// so handlers downstream don't have to know which authentication path ran.
//
// Differs from `apps/sso-service/internal/middleware/session_cookie.go` (which
// is pass-through to accommodate login redirects) by being STRICT: missing or
// invalid cookie returns 401. Intended for API endpoints, not interactive
// OAuth flows.
package middleware

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"

	"github.com/gofiber/fiber/v2"

	"github.com/wave-connect/sso-platform/apps/identity-service/internal/repository"
)

// SessionCookieAuth enforces a valid sso_session cookie. Populates
// c.Locals("user_id": uuid.UUID, "tenant_id": uuid.UUID) on success; returns
// 401 otherwise. Use for endpoints that are browser-facing and don't mint
// PASETO access tokens (e.g. post-signup domain management).
func SessionCookieAuth(sessionRepo *repository.SessionRepository) fiber.Handler {
	return func(c *fiber.Ctx) error {
		cookieValue := c.Cookies("sso_session")
		if cookieValue == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "missing session cookie"})
		}

		tokenHash, err := hashSessionCookieToken(cookieValue)
		if err != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid session cookie"})
		}

		sess, err := sessionRepo.GetByTokenHash(c.Context(), tokenHash)
		if err != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid or expired session"})
		}

		c.Locals("user_id", sess.UserID)
		c.Locals("tenant_id", sess.TenantID)
		return c.Next()
	}
}

// hashSessionCookieToken mirrors `handler.hashSessionCookie` — base64url-decode
// then SHA-256 hex. Duplicated here to avoid an import cycle between handler
// and middleware.
func hashSessionCookieToken(raw string) (string, error) {
	b, err := base64.RawURLEncoding.DecodeString(raw)
	if err != nil {
		return "", err
	}
	h := sha256.Sum256(b)
	return hex.EncodeToString(h[:]), nil
}
