//go:build integration

// Route-level integration tests for MFA delete policy enforcement. These
// guard against the middleware-wiring class of regression — the repo-level
// tests in internal/repository/mfa_integration_test.go prove the lock + count
// + delete invariant, but they don't catch "we forgot to mount
// TenantPolicyEnforcement on /auth/mfa/*". This file is the trip-wire for
// that bug. Run with:
//   go test -tags=integration ./internal/handler/...
package handler

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/go-playground/validator/v10"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"

	"github.com/wave-connect/sso-platform/apps/identity-service/internal/config"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/middleware"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/model"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/repository"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/service"
)

type mfaRouteFixture struct {
	app          *fiber.App
	pool         *pgxpool.Pool
	mfaRepo      *repository.MfaRepository
	policyRepo   *repository.PolicyRepository
	userID       uuid.UUID
	tenantID     uuid.UUID
	enrollmentID uuid.UUID
}

func setupRoute(t *testing.T) mfaRouteFixture {
	t.Helper()
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		url = "postgres://app_readwrite:dev@localhost:5433/sso_dev?sslmode=disable"
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Skipf("cannot open test DB: %v", err)
	}
	if err := pool.Ping(ctx); err != nil {
		t.Skipf("DB ping failed: %v", err)
	}
	t.Cleanup(pool.Close)

	tenantID := uuid.New()
	userID := uuid.New()
	slug := "mfa-route-" + tenantID.String()

	if _, err := pool.Exec(ctx, `
		INSERT INTO tenants (id,name,slug,display_name,domain,plan,tenant_kind,max_users,max_apps,is_active,version,created_at,updated_at)
		VALUES ($1,'MFA Route',$2,'MFA Route',$3,'free','organization',50,5,TRUE,1,NOW(),NOW())
	`, tenantID, slug, slug+".test"); err != nil {
		t.Fatalf("seed tenant: %v", err)
	}
	if _, err := pool.Exec(ctx, `
		INSERT INTO users (id,email,email_verified,password_hash,display_name,avatar_url,locale,timezone,status,version,created_at,updated_at)
		VALUES ($1,$2,TRUE,'stub','Test','', 'en','UTC','active',1,NOW(),NOW())
	`, userID, "mfa-route-"+userID.String()+"@example.test"); err != nil {
		t.Fatalf("seed user: %v", err)
	}
	// Default policy: MFA NOT required. Tests flip the bit per case.
	if _, err := pool.Exec(ctx, `
		INSERT INTO tenant_policies (id,tenant_id,password_require_mfa,allowed_mfa_methods,version,created_at,updated_at)
		VALUES (gen_random_uuid(),$1,FALSE,ARRAY['totp','webauthn']::TEXT[],1,NOW(),NOW())
	`, tenantID); err != nil {
		t.Fatalf("seed policy: %v", err)
	}

	redisAddr := os.Getenv("REDIS_ADDR")
	if redisAddr == "" {
		redisAddr = "localhost:6379"
	}
	rdb := redis.NewClient(&redis.Options{Addr: redisAddr})
	if err := rdb.Ping(ctx).Err(); err != nil {
		t.Skipf("Redis unreachable at %s: %v", redisAddr, err)
	}
	t.Cleanup(func() {
		// Drop any cached policy this test wrote so subsequent runs see fresh state.
		_ = rdb.Del(ctx, "tenant_policy:"+tenantID.String()).Err()
		_ = rdb.Close()
	})

	mfaRepo := repository.NewMfaRepository(pool)
	policyRepo := repository.NewPolicyRepository(pool)
	policySvc := service.NewPolicyService(policyRepo, rdb, zerolog.Nop())

	log := zerolog.New(os.Stderr).Level(zerolog.WarnLevel)

	// Build a handler with only the deps DeleteEnrollment needs. The other
	// constructor params (sessionSvc, webauthnSvc, etc.) aren't exercised by
	// the route under test, so nil is acceptable as long as the test only
	// hits DELETE /auth/mfa/enrollments/:id.
	mfaHandler := NewMfaHandler(
		nil, mfaRepo, nil, nil, nil, nil, nil, nil,
		validator.New(), log, time.Hour, config.CookieConfig{},
	)

	app := fiber.New()

	// Stub auth: parse a header X-Test-User-ID and stash it in Locals exactly
	// where PASETOAuth would have. Keeps the test focused on policy + handler
	// without dragging the entire PASETO signer into the fixture.
	stubAuth := func(c *fiber.Ctx) error {
		uidStr := c.Get("X-Test-User-ID")
		if uidStr == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "missing X-Test-User-ID"})
		}
		uid, err := uuid.Parse(uidStr)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "bad X-Test-User-ID"})
		}
		c.Locals("user_id", uid)
		return c.Next()
	}

	// Mount the same chain main.go uses for /auth/mfa, swapping PASETOAuth for
	// the stub above. This is the exact integration we want to verify: real
	// TenantExtraction, real TenantPolicyEnforcement, real handler.
	mfa := app.Group(
		"/auth/mfa",
		middleware.TenantExtraction(pool),
		stubAuth,
		middleware.TenantPolicyEnforcement(policySvc, log),
	)
	mfa.Delete("/enrollments/:id", mfaHandler.DeleteEnrollment)

	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM mfa_enrollments WHERE user_id = $1`, userID)
		_, _ = pool.Exec(ctx, `DELETE FROM tenant_policies WHERE tenant_id = $1`, tenantID)
		_, _ = pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, userID)
		_, _ = pool.Exec(ctx, `DELETE FROM tenants WHERE id = $1`, tenantID)
	})

	return mfaRouteFixture{
		app:        app,
		pool:       pool,
		mfaRepo:    mfaRepo,
		policyRepo: policyRepo,
		userID:     userID,
		tenantID:   tenantID,
	}
}

func seedActive(t *testing.T, f mfaRouteFixture, method string) uuid.UUID {
	t.Helper()
	now := time.Now().UTC()
	id := uuid.New()
	if err := f.mfaRepo.CreateEnrollment(context.Background(), &model.MfaEnrollment{
		ID:              id,
		UserID:          f.userID,
		Method:          method,
		Status:          "active",
		SecretEncrypted: "test-" + id.String(),
		CreatedAt:       now,
		UpdatedAt:       now,
	}); err != nil {
		t.Fatalf("seed %s enrollment: %v", method, err)
	}
	return id
}

func setPolicyRequireMFA(t *testing.T, f mfaRouteFixture, require bool) {
	t.Helper()
	if _, err := f.pool.Exec(context.Background(), `
		UPDATE tenant_policies SET password_require_mfa = $1 WHERE tenant_id = $2
	`, require, f.tenantID); err != nil {
		t.Fatalf("update policy: %v", err)
	}
}

func deleteEnrollmentReq(f mfaRouteFixture, enrollmentID uuid.UUID) *httptest.ResponseRecorder {
	req := httptest.NewRequest("DELETE", "/auth/mfa/enrollments/"+enrollmentID.String(), nil)
	req.Header.Set("X-Tenant-ID", f.tenantID.String())
	req.Header.Set("X-Test-User-ID", f.userID.String())
	resp, err := f.app.Test(req, -1)
	if err != nil {
		panic(err)
	}
	rec := httptest.NewRecorder()
	rec.Code = resp.StatusCode
	for k, v := range resp.Header {
		rec.Header()[k] = v
	}
	if resp.Body != nil {
		buf := make([]byte, 0, 1024)
		tmp := make([]byte, 512)
		for {
			n, err := resp.Body.Read(tmp)
			if n > 0 {
				buf = append(buf, tmp[:n]...)
			}
			if err != nil {
				break
			}
		}
		_, _ = rec.Body.Write(buf)
		_ = resp.Body.Close()
	}
	return rec
}

func TestRoute_DeleteEnrollment_PolicyOff_Succeeds(t *testing.T) {
	f := setupRoute(t)
	enrollmentID := seedActive(t, f, "totp")
	setPolicyRequireMFA(t, f, false)

	rec := deleteEnrollmentReq(f, enrollmentID)
	if rec.Code != fiber.StatusNoContent {
		t.Fatalf("expected 204, got %d (body=%s)", rec.Code, rec.Body.String())
	}
}

func TestRoute_DeleteEnrollment_PolicyOn_LastActive_Returns409(t *testing.T) {
	// This is the canonical Milestone B integration check: with
	// password_require_mfa=true and only one active enrollment, the route
	// must refuse with 409 and surface allowed_methods. If the policy
	// middleware ever gets dropped from the mfa group again, this test will
	// fail because the handler falls open and returns 204.
	f := setupRoute(t)
	enrollmentID := seedActive(t, f, "totp")
	setPolicyRequireMFA(t, f, true)

	rec := deleteEnrollmentReq(f, enrollmentID)
	if rec.Code != fiber.StatusConflict {
		t.Fatalf("expected 409, got %d (body=%s)", rec.Code, rec.Body.String())
	}

	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("parse body: %v", err)
	}
	if body["error"] != "mfa_required_by_policy" {
		t.Fatalf("expected error=mfa_required_by_policy, got %v", body["error"])
	}
	methods, ok := body["allowed_methods"].([]any)
	if !ok || len(methods) == 0 {
		t.Fatalf("expected non-empty allowed_methods, got %v", body["allowed_methods"])
	}

	// Row must still exist after refusal.
	if _, err := f.mfaRepo.GetEnrollmentByID(context.Background(), enrollmentID); err != nil {
		t.Fatalf("enrollment should still exist: %v", err)
	}
}

func TestRoute_DeleteEnrollment_PolicyOn_TwoActive_Succeeds(t *testing.T) {
	f := setupRoute(t)
	totpID := seedActive(t, f, "totp")
	_ = seedActive(t, f, "webauthn")
	setPolicyRequireMFA(t, f, true)

	rec := deleteEnrollmentReq(f, totpID)
	if rec.Code != fiber.StatusNoContent {
		t.Fatalf("expected 204, got %d (body=%s)", rec.Code, rec.Body.String())
	}
}

func TestRoute_DeleteEnrollment_NotFound_Returns404(t *testing.T) {
	f := setupRoute(t)
	setPolicyRequireMFA(t, f, true)

	rec := deleteEnrollmentReq(f, uuid.New())
	if rec.Code != fiber.StatusNotFound {
		t.Fatalf("expected 404, got %d (body=%s)", rec.Code, rec.Body.String())
	}
}
