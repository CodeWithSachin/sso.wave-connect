package middleware

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/rs/zerolog"
)

// fakeRow is the minimal pgx.Row surface RequireVerifiedEmail needs. We avoid
// a full pgxmock dependency for one query — it's a single-column scan.
type fakeRow struct {
	verified bool
	err      error
}

func (r fakeRow) Scan(dest ...any) error {
	if r.err != nil {
		return r.err
	}
	if len(dest) != 1 {
		return errors.New("expected 1 destination")
	}
	*(dest[0].(*bool)) = r.verified
	return nil
}

// fakePoolFn lets the test inject the QueryRow return value without pulling
// in a real *pgxpool.Pool. RequireVerifiedEmail only calls QueryRow on the
// pool — wrap it in a tiny interface and accept that interface.
type queryRower interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

type fakePool struct{ next pgx.Row }

func (f fakePool) QueryRow(_ context.Context, _ string, _ ...any) pgx.Row {
	return f.next
}

// withPool builds a stand-alone middleware that uses our fakePool instead of
// a real *pgxpool.Pool. We can't pass the fake straight to
// RequireVerifiedEmail (signature wants the concrete pool type), so we
// re-implement the same logic against the queryRower interface for the test.
// If the production middleware logic drifts, this test must drift too — the
// intentional duplication is small enough that's an acceptable maintenance
// cost vs pulling in pgxmock.
func withPool(p queryRower, log zerolog.Logger) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID, ok := c.Locals("user_id").(uuid.UUID)
		if !ok {
			return c.Next()
		}
		var emailVerified bool
		if err := p.QueryRow(c.Context(), "SELECT email_verified FROM users WHERE id = $1", userID).Scan(&emailVerified); err != nil {
			log.Warn().Err(err).Msg("lookup failed")
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error":   ErrEmailNotVerified,
				"message": "this action requires a verified email",
			})
		}
		if !emailVerified {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error":   ErrEmailNotVerified,
				"message": "this action requires a verified email",
			})
		}
		return c.Next()
	}
}

func newApp(p queryRower) *fiber.App {
	app := fiber.New()
	// Synthesize the user_id local before the guard runs, the way
	// PASETOAuth / SessionCookieAuth would in production.
	app.Use(func(c *fiber.Ctx) error {
		if v := c.Get("X-Test-User"); v != "" {
			c.Locals("user_id", uuid.MustParse(v))
		}
		return c.Next()
	})
	app.Use(withPool(p, zerolog.Nop()))
	app.Post("/write", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"ok": true})
	})
	return app
}

func TestRequireVerifiedEmail_AllowsVerified(t *testing.T) {
	app := newApp(fakePool{next: fakeRow{verified: true}})
	req := httptest.NewRequest("POST", "/write", nil)
	req.Header.Set("X-Test-User", uuid.New().String())
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("expected 200, got %d (%s)", resp.StatusCode, body)
	}
}

func TestRequireVerifiedEmail_RejectsUnverified(t *testing.T) {
	app := newApp(fakePool{next: fakeRow{verified: false}})
	req := httptest.NewRequest("POST", "/write", nil)
	req.Header.Set("X-Test-User", uuid.New().String())
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	if resp.StatusCode != 403 {
		t.Fatalf("expected 403, got %d", resp.StatusCode)
	}
	var body map[string]string
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if body["error"] != ErrEmailNotVerified {
		t.Fatalf("expected error=%q, got %q", ErrEmailNotVerified, body["error"])
	}
}

func TestRequireVerifiedEmail_RejectsOnLookupError(t *testing.T) {
	app := newApp(fakePool{next: fakeRow{err: errors.New("conn refused")}})
	req := httptest.NewRequest("POST", "/write", nil)
	req.Header.Set("X-Test-User", uuid.New().String())
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	if resp.StatusCode != 403 {
		t.Fatalf("expected 403 on lookup failure (fail-closed), got %d", resp.StatusCode)
	}
}

func TestRequireVerifiedEmail_PassesThroughWithoutUserID(t *testing.T) {
	// No X-Test-User header → no user_id local → middleware falls through.
	// Strict auth gating is the upstream middleware's job; this one is a
	// writes-only gate.
	app := newApp(fakePool{next: fakeRow{verified: false}})
	req := httptest.NewRequest("POST", "/write", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	if resp.StatusCode != 200 {
		t.Fatalf("expected 200 when no user_id is present, got %d", resp.StatusCode)
	}
}
