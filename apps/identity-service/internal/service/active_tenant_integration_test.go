//go:build integration

// Integration tests for ActiveTenantService (Phase 5). Same conventions as
// migration_integration_test.go: `go test -tags=integration ./internal/service/...`,
// requires dev Postgres at localhost:5433, per-test unique UUIDs so tests can
// share the dev DB without colliding.
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

	"github.com/wave-connect/sso-platform/apps/identity-service/internal/repository"
)

// activeTenantFixture wires up two tenants + one user + two memberships +
// one active session for end-to-end tests of list/switch.
type activeTenantFixture struct {
	ctx         context.Context
	pool        *pgxpool.Pool
	svc         *ActiveTenantService
	userID      uuid.UUID
	sessionID   uuid.UUID
	tenantA     uuid.UUID
	tenantB     uuid.UUID
	strangerTenant uuid.UUID
}

func seedActiveTenant(t *testing.T) activeTenantFixture {
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

	f := activeTenantFixture{
		ctx:            ctx,
		pool:           pool,
		userID:         uuid.New(),
		sessionID:      uuid.New(),
		tenantA:        uuid.New(),
		tenantB:        uuid.New(),
		strangerTenant: uuid.New(),
	}

	// Unique per-test slugs + domains to coexist with parallel test runs.
	aSlug := "at-a-" + f.tenantA.String()
	bSlug := "at-b-" + f.tenantB.String()
	sSlug := "at-s-" + f.strangerTenant.String()

	if _, err := pool.Exec(ctx, `
		INSERT INTO tenants (id,name,slug,display_name,domain,plan,tenant_kind,max_users,max_apps,is_active,version,created_at,updated_at)
		VALUES ($1,'A',$2,'A',$3,'free','organization',50,5,TRUE,1,NOW(),NOW())
	`, f.tenantA, aSlug, aSlug+".test"); err != nil {
		t.Fatalf("seed tenant A: %v", err)
	}
	if _, err := pool.Exec(ctx, `
		INSERT INTO tenants (id,name,slug,display_name,domain,plan,tenant_kind,max_users,max_apps,is_active,version,created_at,updated_at)
		VALUES ($1,'B',$2,'B',$3,'free','organization',50,5,TRUE,1,NOW(),NOW())
	`, f.tenantB, bSlug, bSlug+".test"); err != nil {
		t.Fatalf("seed tenant B: %v", err)
	}
	if _, err := pool.Exec(ctx, `
		INSERT INTO tenants (id,name,slug,display_name,domain,plan,tenant_kind,max_users,max_apps,is_active,version,created_at,updated_at)
		VALUES ($1,'Stranger',$2,'Stranger',$3,'free','organization',50,5,TRUE,1,NOW(),NOW())
	`, f.strangerTenant, sSlug, sSlug+".test"); err != nil {
		t.Fatalf("seed stranger tenant: %v", err)
	}
	if _, err := pool.Exec(ctx, `
		INSERT INTO users (id,email,email_verified,password_hash,display_name,avatar_url,locale,timezone,status,version,created_at,updated_at)
		VALUES ($1,$2,TRUE,'stub','Test','', 'en','UTC','active',1,NOW(),NOW())
	`, f.userID, "at-"+f.userID.String()+"@example.test"); err != nil {
		t.Fatalf("seed user: %v", err)
	}
	if _, err := pool.Exec(ctx, `
		INSERT INTO memberships (id,user_id,tenant_id,role,joined_at,created_at,updated_at) VALUES
			(gen_random_uuid(),$1,$2,'owner',NOW(),NOW(),NOW()),
			(gen_random_uuid(),$1,$3,'member',NOW(),NOW(),NOW())
	`, f.userID, f.tenantA, f.tenantB); err != nil {
		t.Fatalf("seed memberships: %v", err)
	}
	// Active session anchored at tenant A, active also on A.
	if _, err := pool.Exec(ctx, `
		INSERT INTO sessions (id,user_id,tenant_id,active_tenant_id,token_hash,status,ip_address,user_agent,last_activity_at,expires_at,created_at)
		VALUES ($1,$2,$3,$3,$4,'active','127.0.0.1','test',NOW(),NOW()+INTERVAL '1 hour',NOW())
	`, f.sessionID, f.userID, f.tenantA, "test-hash-"+f.sessionID.String()); err != nil {
		t.Fatalf("seed session: %v", err)
	}

	log := zerolog.New(os.Stderr).Level(zerolog.WarnLevel)
	// Pass nil for the rotate-only deps (userRepo, familyRepo, tokenSvc) —
	// these tests exercise list + switch only. Rotate has its own coverage
	// once wired against a real token service.
	f.svc = NewActiveTenantService(
		repository.NewMembershipRepository(pool),
		repository.NewSessionRepository(pool),
		nil, nil, nil, 0,
		log,
	)

	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM sessions WHERE id=$1`, f.sessionID)
		_, _ = pool.Exec(ctx, `DELETE FROM memberships WHERE user_id=$1`, f.userID)
		_, _ = pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, f.userID)
		_, _ = pool.Exec(ctx, `DELETE FROM tenants WHERE id IN ($1,$2,$3)`, f.tenantA, f.tenantB, f.strangerTenant)
	})
	return f
}

func TestActiveTenant_ListMemberships_MarksActive(t *testing.T) {
	f := seedActiveTenant(t)
	views, err := f.svc.ListMemberships(f.ctx, f.userID, f.tenantA)
	if err != nil {
		t.Fatalf("ListMemberships: %v", err)
	}
	if len(views) != 2 {
		t.Fatalf("expected 2 memberships, got %d", len(views))
	}
	activeCount := 0
	for _, v := range views {
		if v.IsActive {
			activeCount++
			if v.TenantID != f.tenantA {
				t.Fatalf("IsActive set on wrong tenant: %s, want %s", v.TenantID, f.tenantA)
			}
		}
	}
	if activeCount != 1 {
		t.Fatalf("expected exactly 1 active, got %d", activeCount)
	}
}

func TestActiveTenant_Switch_HappyPath_UpdatesSession(t *testing.T) {
	f := seedActiveTenant(t)
	if err := f.svc.SwitchActiveTenant(f.ctx, f.sessionID, f.userID, f.tenantB); err != nil {
		t.Fatalf("SwitchActiveTenant: %v", err)
	}
	var active uuid.UUID
	if err := f.pool.QueryRow(f.ctx,
		`SELECT active_tenant_id FROM sessions WHERE id=$1`,
		f.sessionID,
	).Scan(&active); err != nil {
		t.Fatalf("read active_tenant: %v", err)
	}
	if active != f.tenantB {
		t.Fatalf("active_tenant_id = %s, want %s", active, f.tenantB)
	}
	// Anchor (tenant_id) stays at A — that's the whole point of splitting.
	var anchor uuid.UUID
	_ = f.pool.QueryRow(f.ctx, `SELECT tenant_id FROM sessions WHERE id=$1`, f.sessionID).Scan(&anchor)
	if anchor != f.tenantA {
		t.Fatalf("anchor tenant_id mutated: got %s, want %s", anchor, f.tenantA)
	}
}

func TestActiveTenant_Switch_NonMember_Rejects(t *testing.T) {
	f := seedActiveTenant(t)
	err := f.svc.SwitchActiveTenant(f.ctx, f.sessionID, f.userID, f.strangerTenant)
	if !errors.Is(err, ErrTenantNotMember) {
		t.Fatalf("expected ErrTenantNotMember, got %v", err)
	}
	// DB should be untouched.
	var active uuid.UUID
	_ = f.pool.QueryRow(f.ctx, `SELECT active_tenant_id FROM sessions WHERE id=$1`, f.sessionID).Scan(&active)
	if active != f.tenantA {
		t.Fatalf("active_tenant_id changed on denied switch: got %s", active)
	}
}

func TestActiveTenant_Switch_Idempotent(t *testing.T) {
	f := seedActiveTenant(t)
	// Switching to the already-active tenant should succeed (no-op) not error.
	if err := f.svc.SwitchActiveTenant(f.ctx, f.sessionID, f.userID, f.tenantA); err != nil {
		t.Fatalf("idempotent switch failed: %v", err)
	}
}

func TestActiveTenant_Switch_ExpiredSession_Rejects(t *testing.T) {
	f := seedActiveTenant(t)
	// Expire the session out from under us.
	_, _ = f.pool.Exec(f.ctx,
		`UPDATE sessions SET expires_at = NOW() - INTERVAL '1 minute' WHERE id=$1`,
		f.sessionID,
	)
	err := f.svc.SwitchActiveTenant(f.ctx, f.sessionID, f.userID, f.tenantB)
	if !errors.Is(err, repository.ErrSessionNotFound) {
		t.Fatalf("expected ErrSessionNotFound on expired session, got %v", err)
	}
	_ = time.Second // silence unused import if tests thin out later
}
