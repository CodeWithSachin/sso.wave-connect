// Package middleware — verified_email.go
//
// `RequireVerifiedEmail` gates write-shaped endpoints behind the user's
// `email_verified` flag. Signup mints a session immediately so the user can
// land on a dashboard, but writes (MFA enrolment, tenant switch, etc.)
// stay closed until the verification link is clicked. This is the explicit
// signup-verification gate the E2E review flagged as A1.
//
// Reads `user_id` from Fiber locals — works with either upstream middleware
// (PASETOAuth or SessionCookieAuth populate it identically). Looks up
// `email_verified` from the `users` table directly; we deliberately don't
// cache, because the verification window is the one place we want fresh
// reads.
package middleware

import (
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog"
)

// ErrEmailNotVerified is the response code the consoles + dev SDK match on
// to render a "please verify your email" banner / toast. Keep the value
// stable; it's a contract.
const ErrEmailNotVerified = "email_not_verified"

// RequireVerifiedEmail rejects requests with 403 when the authenticated
// user's email is unverified. MUST run AFTER PASETOAuth or
// SessionCookieAuth — without `user_id` in locals it falls through with
// no enforcement (open by default to avoid a regression cascade if the
// chain is mis-ordered).
func RequireVerifiedEmail(pool *pgxpool.Pool, log zerolog.Logger) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID, ok := c.Locals("user_id").(uuid.UUID)
		if !ok {
			// No auth context — fall through. The upstream auth middleware
			// already 401s when it's strictly required; this guard is
			// strictly a writes-gate.
			return c.Next()
		}

		var emailVerified bool
		err := pool.QueryRow(c.Context(),
			`SELECT email_verified FROM users WHERE id = $1`, userID,
		).Scan(&emailVerified)
		if err != nil {
			// User row missing under an authenticated session is a real
			// problem — log and treat as forbidden so a deleted-but-still-
			// cookied user can't bypass.
			log.Warn().Err(err).Str("user_id", userID.String()).
				Msg("verified-email check: user lookup failed")
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error":   ErrEmailNotVerified,
				"message": "this action requires a verified email",
			})
		}
		if !emailVerified {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error":   ErrEmailNotVerified,
				"message": "this action requires a verified email — check your inbox for the verification link",
			})
		}
		return c.Next()
	}
}
