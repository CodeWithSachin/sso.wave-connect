//go:build integration

// Integration tests for MigrationService. Run with:
//
//	go test -tags=integration ./internal/service/...
//
// Requires a running Postgres on localhost:5433 (sso-postgres docker
// container) with migrations through 000026 applied. Tests use unique UUIDs
// per test so they can run in parallel against a shared DB without
// collision, and clean up their own rows in t.Cleanup().
package service

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog"

	"github.com/wave-connect/sso-platform/apps/identity-service/internal/email"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/event"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/repository"
)

// testDB opens a pool against the dev DB. DATABASE_URL overrides the default.
func testDB(t *testing.T) *pgxpool.Pool {
	t.Helper()
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		url = "postgres://app_readwrite:dev@localhost:5433/sso_dev?sslmode=disable"
	}
	pool, err := pgxpool.New(context.Background(), url)
	if err != nil {
		t.Skipf("skipping: cannot connect to test DB: %v", err)
	}
	if err := pool.Ping(context.Background()); err != nil {
		t.Skipf("skipping: DB ping failed: %v", err)
	}
	t.Cleanup(pool.Close)
	return pool
}

// fixture holds the seeded rows for a single test so the test body can
// mutate them via the service layer and then assert state transitions.
type fixture struct {
	ctx          context.Context
	pool         *pgxpool.Pool
	svc          *MigrationService
	migrationID  uuid.UUID
	userID       uuid.UUID
	fromTenant   uuid.UUID
	toTenant     uuid.UUID
	token        string
}

// seed creates: personal tenant, org tenant, user, owner membership on
// personal, and a migration row. expiresIn lets tests pick already-expired
// or still-valid offers without sleeping.
func seed(t *testing.T, expiresIn time.Duration) fixture {
	t.Helper()
	pool := testDB(t)
	ctx := context.Background()

	f := fixture{
		ctx:         ctx,
		pool:        pool,
		migrationID: uuid.New(),
		userID:      uuid.New(),
		fromTenant:  uuid.New(),
		toTenant:    uuid.New(),
		token:       "test-" + uuid.NewString(),
	}

	// Tenants (one personal, one organization). Slugs AND domains are
	// pre-rendered from the uuid so each test gets globally unique values —
	// `tenants.domain` has a UNIQUE constraint that bites parallel tests
	// on the shared dev DB.
	persSlug := "pers-" + f.fromTenant.String()
	orgSlug := "org-" + f.toTenant.String()
	persDomain := "pers-" + f.fromTenant.String() + ".test"
	orgDomain := "org-" + f.toTenant.String() + ".test"
	if _, err := pool.Exec(ctx, `
		INSERT INTO tenants (id, name, slug, display_name, domain, plan, tenant_kind, max_users, max_apps, is_active, version, created_at, updated_at)
		VALUES ($1, 'pers', $2, 'Personal', $3, 'free', 'personal', 1, 1, TRUE, 1, NOW(), NOW())
	`, f.fromTenant, persSlug, persDomain); err != nil {
		t.Fatalf("seed personal tenant: %v", err)
	}
	if _, err := pool.Exec(ctx, `
		INSERT INTO tenants (id, name, slug, display_name, domain, plan, tenant_kind, max_users, max_apps, is_active, version, created_at, updated_at)
		VALUES ($1, 'org', $2, 'Org', $3, 'free', 'organization', 50, 5, TRUE, 1, NOW(), NOW())
	`, f.toTenant, orgSlug, orgDomain); err != nil {
		t.Fatalf("seed org tenant: %v", err)
	}

	// User (email domain matches org.test so ListCandidatesForDomain would
	// find them; not directly used here but keeps seed realistic).
	userEmail := "u-" + f.userID.String() + "@org.test"
	if _, err := pool.Exec(ctx, `
		INSERT INTO users (id, email, email_verified, password_hash, display_name, avatar_url, locale, timezone, status, version, created_at, updated_at)
		VALUES ($1, $2, TRUE, 'stub', 'Test U', '', 'en', 'UTC', 'active', 1, NOW(), NOW())
	`, f.userID, userEmail); err != nil {
		t.Fatalf("seed user: %v", err)
	}

	// Owner membership on personal.
	if _, err := pool.Exec(ctx, `
		INSERT INTO memberships (id, user_id, tenant_id, role, joined_at, created_at, updated_at)
		VALUES (gen_random_uuid(), $1, $2, 'owner', NOW(), NOW(), NOW())
	`, f.userID, f.fromTenant); err != nil {
		t.Fatalf("seed membership: %v", err)
	}

	// Migration offer. expires_at computed as NOW() + given interval.
	// Interval is expressed as seconds to sidestep interval-literal parsing.
	if _, err := pool.Exec(ctx, `
		INSERT INTO tenant_domain_migrations
			(id, user_id, from_tenant_id, to_tenant_id, domain, status,
			 notification_token, offered_at, expires_at, created_at, updated_at)
		VALUES ($1, $2, $3, $4, 'org.test', 'offered', $5, NOW(), NOW() + make_interval(secs => $6), NOW(), NOW())
	`, f.migrationID, f.userID, f.fromTenant, f.toTenant, f.token, expiresIn.Seconds()); err != nil {
		t.Fatalf("seed migration: %v", err)
	}

	// Wire a real MigrationService against the test pool.
	log := zerolog.New(os.Stderr).Level(zerolog.WarnLevel)
	f.svc = NewMigrationService(MigrationServiceDeps{
		Pool:            pool,
		MigrationRepo:   repository.NewTenantDomainMigrationRepository(pool),
		SessionRepo:     repository.NewSessionRepository(pool),
		Outbox:          event.NewOutbox(pool),
		AuthzOutboxRepo: repository.NewAuthzOutboxRepository(),
		EmailProvider:   email.NewConsoleProvider(log, "test@local"),
		SenderAddress:   "test@local",
		Log:             log,
	})

	t.Cleanup(func() {
		// Order matters: FK ON DELETE CASCADE on migrations → users, but
		// memberships FK tenants, and tenants stand alone. Delete bottom-up.
		_, _ = pool.Exec(ctx, `DELETE FROM tenant_domain_migrations WHERE id=$1`, f.migrationID)
		_, _ = pool.Exec(ctx, `DELETE FROM memberships WHERE user_id=$1`, f.userID)
		_, _ = pool.Exec(ctx, `DELETE FROM sessions WHERE user_id=$1`, f.userID)
		_, _ = pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, f.userID)
		_, _ = pool.Exec(ctx, `DELETE FROM tenants WHERE id IN ($1, $2)`, f.fromTenant, f.toTenant)
		_, _ = pool.Exec(ctx, `DELETE FROM authz_outbox WHERE idempotency_key LIKE 'migration:'||$1::text||'%'`, f.migrationID)
		_, _ = pool.Exec(ctx, `DELETE FROM event_outbox WHERE payload::text LIKE '%'||$1::text||'%'`, f.migrationID)
	})

	return f
}

// --- tests ---------------------------------------------------------------

func TestMigration_Accept_HappyPath(t *testing.T) {
	f := seed(t, 24*time.Hour)
	if _, err := f.svc.Accept(f.ctx, f.token); err != nil {
		t.Fatalf("Accept: %v", err)
	}
	// Status flipped, personal tenant soft-deleted, membership moved.
	assertStatus(t, f, "accepted")
	assertPersonalSoftDeleted(t, f)
	assertMembership(t, f, f.toTenant, "member")
}

func TestMigration_Accept_AlreadyAccepted_ReturnsResolved(t *testing.T) {
	f := seed(t, 24*time.Hour)
	if _, err := f.svc.Accept(f.ctx, f.token); err != nil {
		t.Fatalf("first Accept: %v", err)
	}
	_, err := f.svc.Accept(f.ctx, f.token)
	if !errors.Is(err, ErrMigrationAlreadyResolved) {
		t.Fatalf("second Accept: want ErrMigrationAlreadyResolved, got %v", err)
	}
}

func TestMigration_Accept_Expired_ReturnsExpired(t *testing.T) {
	f := seed(t, -time.Hour) // already past expires_at
	_, err := f.svc.Accept(f.ctx, f.token)
	if !errors.Is(err, ErrMigrationExpired) {
		t.Fatalf("Accept on expired: want ErrMigrationExpired, got %v", err)
	}
}

func TestMigration_Decline_FlipsStatusOnly(t *testing.T) {
	f := seed(t, 24*time.Hour)
	if _, err := f.svc.Decline(f.ctx, f.token); err != nil {
		t.Fatalf("Decline: %v", err)
	}
	assertStatus(t, f, "declined")
	// Membership untouched, personal tenant still live.
	assertMembership(t, f, f.fromTenant, "owner")
	assertPersonalAlive(t, f)
}

func TestMigration_Force_BeforeGraceOrNotice_Rejects(t *testing.T) {
	f := seed(t, 24*time.Hour)
	actor := uuid.New()
	// No NotifyForce yet → ErrForceNoticeTooRecent (also grace not up, but
	// notice check is evaluated first when force_notified_at is NULL).
	_, err := f.svc.Force(f.ctx, f.migrationID, actor)
	if !errors.Is(err, ErrForceNoticeTooRecent) && !errors.Is(err, ErrMigrationNotForcible) {
		t.Fatalf("Force before notice: want ErrForceNoticeTooRecent or ErrMigrationNotForcible, got %v", err)
	}
}

func TestMigration_Force_DeclinedSkipsGrace_ButNeedsNotice(t *testing.T) {
	f := seed(t, 24*time.Hour)
	if _, err := f.svc.Decline(f.ctx, f.token); err != nil {
		t.Fatalf("Decline: %v", err)
	}
	actor := uuid.New()
	_, err := f.svc.Force(f.ctx, f.migrationID, actor)
	// Grace is bypassed for declined rows, but the notice window still applies.
	if !errors.Is(err, ErrForceNoticeTooRecent) {
		t.Fatalf("Force after decline without notice: want ErrForceNoticeTooRecent, got %v", err)
	}
}

// --- helpers -------------------------------------------------------------

func assertStatus(t *testing.T, f fixture, want string) {
	t.Helper()
	var got string
	if err := f.pool.QueryRow(f.ctx,
		`SELECT status::text FROM tenant_domain_migrations WHERE id=$1`,
		f.migrationID,
	).Scan(&got); err != nil {
		t.Fatalf("read status: %v", err)
	}
	if got != want {
		t.Fatalf("migration status = %q, want %q", got, want)
	}
}

func assertPersonalSoftDeleted(t *testing.T, f fixture) {
	t.Helper()
	var deletedAt *time.Time
	if err := f.pool.QueryRow(f.ctx,
		`SELECT deleted_at FROM tenants WHERE id=$1`,
		f.fromTenant,
	).Scan(&deletedAt); err != nil {
		t.Fatalf("read personal tenant: %v", err)
	}
	if deletedAt == nil {
		t.Fatalf("expected personal tenant soft-deleted, got deleted_at=NULL")
	}
}

func assertPersonalAlive(t *testing.T, f fixture) {
	t.Helper()
	var deletedAt *time.Time
	if err := f.pool.QueryRow(f.ctx,
		`SELECT deleted_at FROM tenants WHERE id=$1`,
		f.fromTenant,
	).Scan(&deletedAt); err != nil {
		t.Fatalf("read personal tenant: %v", err)
	}
	if deletedAt != nil {
		t.Fatalf("expected personal tenant alive, got deleted_at=%v", *deletedAt)
	}
}

func assertMembership(t *testing.T, f fixture, tenantID uuid.UUID, wantRole string) {
	t.Helper()
	var role string
	err := f.pool.QueryRow(f.ctx,
		`SELECT role FROM memberships WHERE user_id=$1 AND tenant_id=$2`,
		f.userID, tenantID,
	).Scan(&role)
	if err != nil {
		t.Fatalf("read membership (user=%s tenant=%s): %v", f.userID, tenantID, err)
	}
	if role != wantRole {
		t.Fatalf("membership role = %q, want %q", role, wantRole)
	}
}
