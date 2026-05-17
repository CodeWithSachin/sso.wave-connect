package handler

import (
	"time"

	"github.com/gofiber/fiber/v2"

	"github.com/wave-connect/sso-platform/apps/identity-service/internal/config"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/model"
)

// setSSOCookie is the SOLE in-process writer of `sso_session` for the
// identity-service binary. Every other handler in this service that needs
// to issue a session MUST call this function — duplicating the
// fiber.Cookie literal anywhere else risks Set-Cookie drift, which the
// browser materializes as a *second* sibling cookie at the same name
// instead of overwriting (ADR-0002 §C).
//
// Cross-service: sso-service has its own co-writer in
// apps/sso-service/internal/handler/idp_oidc.go for the IdP-callback flow.
// Until that writer is removed, both must produce byte-identical
// Set-Cookie attributes (Domain, Path, Secure, SameSite, HTTPOnly).
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
