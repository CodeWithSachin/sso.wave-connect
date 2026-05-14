//go:build integration

// Integration tests for MfaRepository.DeleteEnrollmentEnforcingPolicy — the
// policy-aware delete added for Milestone B (org-enforced MFA). Run with:
//   go test -tags=integration ./internal/repository/...
//
// Same conventions as the service-level integration tests:
//   - Requires dev Postgres at localhost:5433 (or DATABASE_URL override).
//   - Skips (not fails) when the DB is unreachable so CI without infra is fine.
//   - Per-test unique UUIDs + t.Cleanup so parallel runs don't collide.
//
// Why test at the repo layer and not the handler: the race-free invariant
// (the SELECT ... FOR UPDATE lock across all of a user's enrollments) is the
// hard part. The handler's job is just to translate ErrMfaRequiredByPolicy
// into HTTP 409, which is trivial.
package repository

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/wave-connect/sso-platform/apps/identity-service/internal/model"
)

type mfaFixture struct {
	ctx    context.Context
	pool   *pgxpool.Pool
	repo   *MfaRepository
	userID uuid.UUID
}

func seedMfaFixture(t *testing.T) mfaFixture {
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

	userID := uuid.New()
	if _, err := pool.Exec(ctx, `
		INSERT INTO users (id,email,email_verified,password_hash,display_name,avatar_url,locale,timezone,status,version,created_at,updated_at)
		VALUES ($1,$2,TRUE,'stub','Test','', 'en','UTC','active',1,NOW(),NOW())
	`, userID, "mfa-"+userID.String()+"@example.test"); err != nil {
		t.Fatalf("seed user: %v", err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM mfa_enrollments WHERE user_id = $1`, userID)
		_, _ = pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, userID)
	})

	return mfaFixture{
		ctx:    ctx,
		pool:   pool,
		repo:   NewMfaRepository(pool),
		userID: userID,
	}
}

func seedActiveEnrollment(t *testing.T, f mfaFixture, method string) uuid.UUID {
	t.Helper()
	now := time.Now().UTC()
	enrollmentID := uuid.New()
	e := &model.MfaEnrollment{
		ID:              enrollmentID,
		UserID:          f.userID,
		Method:          method,
		Status:          "active",
		SecretEncrypted: "test-secret-" + enrollmentID.String(),
		IsDefault:       false,
		CreatedAt:       now,
		UpdatedAt:       now,
	}
	if err := f.repo.CreateEnrollment(f.ctx, e); err != nil {
		t.Fatalf("seed enrollment (%s): %v", method, err)
	}
	return enrollmentID
}

func TestDeleteEnrollmentEnforcingPolicy_RefusesLastActiveWhenRequired(t *testing.T) {
	f := seedMfaFixture(t)
	enrollmentID := seedActiveEnrollment(t, f, "totp")

	err := f.repo.DeleteEnrollmentEnforcingPolicy(f.ctx, enrollmentID, f.userID, true)
	if !errors.Is(err, ErrMfaRequiredByPolicy) {
		t.Fatalf("expected ErrMfaRequiredByPolicy, got %v", err)
	}

	// Row must still exist — the refusal is a no-op on data.
	row, err := f.repo.GetEnrollmentByID(f.ctx, enrollmentID)
	if err != nil {
		t.Fatalf("enrollment should still exist after refused delete: %v", err)
	}
	if row.Status != "active" {
		t.Fatalf("status should be unchanged: got %q", row.Status)
	}
}

func TestDeleteEnrollmentEnforcingPolicy_AllowsDeleteWhenAnotherActiveExists(t *testing.T) {
	f := seedMfaFixture(t)
	totpID := seedActiveEnrollment(t, f, "totp")
	_ = seedActiveEnrollment(t, f, "webauthn")

	if err := f.repo.DeleteEnrollmentEnforcingPolicy(f.ctx, totpID, f.userID, true); err != nil {
		t.Fatalf("delete should succeed with another active enrollment: %v", err)
	}
	if _, err := f.repo.GetEnrollmentByID(f.ctx, totpID); !errors.Is(err, ErrEnrollmentNotFound) {
		t.Fatalf("expected ErrEnrollmentNotFound for deleted row, got %v", err)
	}
}

func TestDeleteEnrollmentEnforcingPolicy_AllowsDeleteWhenPolicyOff(t *testing.T) {
	f := seedMfaFixture(t)
	enrollmentID := seedActiveEnrollment(t, f, "totp")

	if err := f.repo.DeleteEnrollmentEnforcingPolicy(f.ctx, enrollmentID, f.userID, false); err != nil {
		t.Fatalf("delete should succeed when policy gate is off: %v", err)
	}
	if _, err := f.repo.GetEnrollmentByID(f.ctx, enrollmentID); !errors.Is(err, ErrEnrollmentNotFound) {
		t.Fatalf("expected ErrEnrollmentNotFound for deleted row, got %v", err)
	}
}

func TestDeleteEnrollmentEnforcingPolicy_NotFound(t *testing.T) {
	f := seedMfaFixture(t)

	err := f.repo.DeleteEnrollmentEnforcingPolicy(f.ctx, uuid.New(), f.userID, true)
	if !errors.Is(err, ErrEnrollmentNotFound) {
		t.Fatalf("expected ErrEnrollmentNotFound, got %v", err)
	}
}

func TestDeleteEnrollmentEnforcingPolicy_PendingEnrollmentDoesNotCountAsActive(t *testing.T) {
	// A pending_setup row (created by Enroll but not yet verified) must not
	// satisfy the "at least one active enrollment remains" requirement —
	// otherwise a user could half-finish enrolling a second method and
	// delete their working one, bricking their account.
	f := seedMfaFixture(t)
	totpID := seedActiveEnrollment(t, f, "totp")
	pendingID := uuid.New()
	now := time.Now().UTC()
	if err := f.repo.CreateEnrollment(f.ctx, &model.MfaEnrollment{
		ID:              pendingID,
		UserID:          f.userID,
		Method:          "totp",
		Status:          "pending_setup",
		SecretEncrypted: "pending-secret",
		CreatedAt:       now,
		UpdatedAt:       now,
	}); err != nil {
		t.Fatalf("seed pending enrollment: %v", err)
	}

	err := f.repo.DeleteEnrollmentEnforcingPolicy(f.ctx, totpID, f.userID, true)
	if !errors.Is(err, ErrMfaRequiredByPolicy) {
		t.Fatalf("expected ErrMfaRequiredByPolicy (pending should not count), got %v", err)
	}
}
