package handler

import (
	"time"

	"github.com/gofiber/fiber/v2"

	"github.com/wave-connect/sso-platform/apps/identity-service/internal/config"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/model"
)

// setSSOCookie sets the HttpOnly `sso_session` cookie for cross-app SSO.
// Extracted from AuthHandler so handlers beyond /auth (e.g. /auth/public/signup)
// can issue sessions without importing AuthHandler state.
//
// No-ops when the session has no raw token (Session.RawToken is transient —
// set only at Session.Create time and zeroed after cookie issue).
func setSSOCookie(c *fiber.Ctx, sess *model.Session, cfg config.CookieConfig) {
	if sess == nil || sess.RawToken == "" {
		return
	}
	c.Cookie(&fiber.Cookie{
		Name:     "sso_session",
		Value:    sess.RawToken,
		Path:     "/",
		Domain:   cfg.Domain,
		HTTPOnly: true,
		Secure:   cfg.Secure,
		SameSite: "Lax",
		MaxAge:   int(time.Until(sess.ExpiresAt).Seconds()),
	})
}

// clearSSOCookieHelper overwrites the sso_session cookie with an expired value.
// Exposed separately from AuthHandler's method for the same reason as setSSOCookie.
func clearSSOCookieHelper(c *fiber.Ctx, cfg config.CookieConfig) {
	c.Cookie(&fiber.Cookie{
		Name:     "sso_session",
		Value:    "",
		Path:     "/",
		Domain:   cfg.Domain,
		HTTPOnly: true,
		Secure:   cfg.Secure,
		SameSite: "Lax",
		MaxAge:   -1,
	})
}
