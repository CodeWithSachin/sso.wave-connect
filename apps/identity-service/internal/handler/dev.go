// Package handler — dev.go
//
// Development-only helpers. Gated by `NODE_ENV != production` AND the
// `IDENTITY_DEV_ENDPOINTS=true` env flag — both must be true to enable.
// Production binaries skip route registration entirely (see main.go).
//
// These exist because dev environments don't have outbound SMTP, so the
// verification email never reaches a user inbox. Without a way to recover
// the link, E2E signup is unreachable without direct DB access.
package handler

import (
	"os"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog"
)

// DevEnabled reports whether dev-only endpoints should be mounted.
// Both signals must be true:
//   - NODE_ENV is anything other than "production"
//   - IDENTITY_DEV_ENDPOINTS=true is set
//
// The two-key gate is intentional — being in a non-production binary alone
// shouldn't expose a verification-token-leak endpoint. Operators must
// explicitly opt in by setting the second env var.
func DevEnabled() bool {
	if os.Getenv("NODE_ENV") == "production" {
		return false
	}
	return os.Getenv("IDENTITY_DEV_ENDPOINTS") == "true"
}

// DevHandler bundles the dev-only routes. Constructed only when DevEnabled()
// is true; otherwise main.go skips both construction and route registration.
type DevHandler struct {
	pool *pgxpool.Pool
	log  zerolog.Logger
}

func NewDevHandler(pool *pgxpool.Pool, log zerolog.Logger) *DevHandler {
	return &DevHandler{pool: pool, log: log}
}

// VerificationLink returns the most recent unconsumed verification token's
// full link for the given email. Returns 404 if no active token exists.
// Intended for E2E and local manual testing only.
//
//	GET /auth/dev/verification-link?email=foo@example.test
//	→ 200 {"link":"http://localhost:4300/verify-email?token=<raw>","email":"foo@..."}
func (h *DevHandler) VerificationLink(c *fiber.Ctx) error {
	email := c.Query("email")
	if email == "" {
		return c.Status(fiber.StatusBadRequest).
			JSON(fiber.Map{"error": "email query parameter required"})
	}

	// The raw token is hashed on storage — we cannot return it. The dev
	// table stores the hash; the only way to retrieve a usable link is to
	// re-issue. We pivot: return a single-use verify-email TOKEN HASH
	// that the dev workflow can post to /auth/public/verify-email's debug
	// counterpart below. The simplest path is: take the most-recent
	// active token's hash and the dev VerifyByHash variant consumes it.
	//
	// In practice the operator workflow is: signup → call this endpoint
	// → use the returned `verify_url` (which posts the raw token if we
	// have one), or fall back to the `verify_now_url` which short-circuits
	// past the hash. We keep both honest by returning both fields.
	var tokenHash string
	var foundEmail string
	err := h.pool.QueryRow(c.Context(), `
		SELECT token_hash, email
		FROM email_verification_tokens
		WHERE email = $1 AND consumed_at IS NULL AND expires_at > NOW()
		ORDER BY created_at DESC
		LIMIT 1
	`, email).Scan(&tokenHash, &foundEmail)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "no active verification token for this email",
		})
	}

	// The raw token isn't recoverable (we only store the hash). What we
	// CAN do is flip the user's email_verified bit directly — this is
	// dev-only, gated by both env keys, and exists precisely so test
	// flows aren't blocked by a missing SMTP path.
	return c.JSON(fiber.Map{
		"email":          foundEmail,
		"token_hash":     tokenHash,
		"verify_now_url": "POST " + c.BaseURL() + "/auth/dev/verify-email?email=" + email,
		"note": "raw verification token is not recoverable (hashed at issue). " +
			"POST the verify_now_url to flip email_verified directly for E2E testing.",
	})
}

// VerifyEmailNow is the dev-only escape hatch — flips email_verified=true
// and status=active for the named user, no token required. Same gate as
// VerificationLink: both NODE_ENV and IDENTITY_DEV_ENDPOINTS must agree.
//
//	POST /auth/dev/verify-email?email=foo@example.test
//	→ 204 No Content on success, 404 if user not found
func (h *DevHandler) VerifyEmailNow(c *fiber.Ctx) error {
	email := c.Query("email")
	if email == "" {
		return c.Status(fiber.StatusBadRequest).
			JSON(fiber.Map{"error": "email query parameter required"})
	}

	tag, err := h.pool.Exec(c.Context(), `
		UPDATE users
		SET email_verified = TRUE,
		    status = CASE WHEN status = 'pending_verification' THEN 'active' ELSE status END,
		    updated_at = NOW()
		WHERE email = $1
	`, email)
	if err != nil {
		h.log.Error().Err(err).Str("email", email).Msg("dev verify-email failed")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "internal error",
		})
	}
	if tag.RowsAffected() == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "no user with that email",
		})
	}

	// Also consume any outstanding verification tokens so the user can't
	// re-trigger a real flow afterwards.
	_, _ = h.pool.Exec(c.Context(), `
		UPDATE email_verification_tokens
		SET consumed_at = NOW()
		WHERE email = $1 AND consumed_at IS NULL
	`, email)

	h.log.Info().Str("email", email).Msg("dev verify-email forced active")
	return c.SendStatus(fiber.StatusNoContent)
}
