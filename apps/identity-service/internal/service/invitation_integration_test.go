//go:build integration

// Integration tests for InvitationService (Phase 6). Same harness shape as
// migration_integration_test.go: `go test -tags=integration ./internal/service/...`,
// per-test unique UUIDs, Cleanup() tears down rows.
package service

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"math/rand"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog"

	"github.com/wave-connect/sso-platform/apps/identity-service/internal/config"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/event"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/repository"
)

// invitationFixture wires up tenant + invited user + pending membership with
// a known token so tests can drive Lookup / Accept / Decline directly.
type invitationFixture struct {
	ctx          context.Context
	pool         *pgxpool.Pool
	svc          *InvitationService
	rawToken     string
	tokenHash    string
	tenantID     uuid.UUID
	userID       uuid.UUID
	membershipID uuid.UUID
}

// seedInvitation creates a fresh tenant + user (no password by default) +
// pending membership. expiresIn <= 0 means already-expired.
func seedInvitation(t *testing.T, expiresIn time.Duration, withPassword bool) invitationFixture {
	t.Helper()
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		url = "postgres://app_readwrite:dev@localhost:5433/sso_dev?sslmode=disable"
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Skipf("cannot connect to test DB: %v", err)
	}
	if err := pool.Ping(ctx); err != nil {
		t.Skipf("DB ping failed: %v", err)
	}
	t.Cleanup(pool.Close)

	f := invitationFixture{
		ctx:          ctx,
		pool:         pool,
		tenantID:     uuid.New(),
		userID:       uuid.New(),
		membershipID: uuid.New(),
	}

	// 32-byte random token (base64url) + its SHA-256 hex hash.
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil { // math/rand is fine here — test randomness
		t.Fatalf("rand: %v", err)
	}
	f.rawToken = base64.RawURLEncoding.EncodeToString(b)
	sum := sha256.Sum256([]byte(f.rawToken))
	f.tokenHash = hex.EncodeToString(sum[:])

	slug := "inv-" + f.tenantID.String()
	if _, err := pool.Exec(ctx, `
		INSERT INTO tenants (id,name,slug,display_name,domain,plan,tenant_kind,max_users,max_apps,is_active,version,created_at,updated_at)
		VALUES ($1,'Inv',$2,'Inv Co',$3,'free','organization',50,5,TRUE,1,NOW(),NOW())
	`, f.tenantID, slug, slug+".test"); err != nil {
		t.Fatalf("seed tenant: %v", err)
	}
	var passwordHash any
	if withPassword {
		passwordHash = "$argon2id$stub"
	} else {
		passwordHash = nil
	}
	status := "pending_verification"
	if withPassword {
		status = "active"
	}
	if _, err := pool.Exec(ctx, `
		INSERT INTO users (id,email,email_verified,password_hash,display_name,avatar_url,locale,timezone,status,version,created_at,updated_at)
		VALUES ($1,$2,$3,$4,'','', 'en','UTC',$5,1,NOW(),NOW())
	`, f.userID, "inv-"+f.userID.String()+"@example.test", withPassword, passwordHash, status); err != nil {
		t.Fatalf("seed user: %v", err)
	}
	expiresAt := time.Now().UTC().Add(expiresIn)
	if _, err := pool.Exec(ctx, `
		INSERT INTO memberships (id,user_id,tenant_id,role,invitation_token,invitation_expires,created_at,updated_at)
		VALUES ($1,$2,$3,'admin',$4,$5,NOW(),NOW())
	`, f.membershipID, f.userID, f.tenantID, f.tokenHash, expiresAt); err != nil {
		t.Fatalf("seed membership: %v", err)
	}

	log := zerolog.New(os.Stderr).Level(zerolog.WarnLevel)
	sessionSvc := NewSessionService(
		repository.NewSessionRepository(pool),
		event.NewLogPublisher(log),
		log,
		30*24*time.Hour,
	)
	f.svc = NewInvitationService(InvitationServiceDeps{
		Pool:            pool,
		InvitationRepo:  repository.NewMembershipInvitationRepository(pool),
		SessionSvc:      sessionSvc,
		PasswordSvc:     NewPasswordService(config.Argon2Config{Memory: 65536, Iterations: 3, Parallelism: 4, KeyLen: 32, SaltLen: 16}),
		AuthzOutboxRepo: repository.NewAuthzOutboxRepository(),
		Outbox:          event.NewOutbox(pool),
		Log:             log,
	})

	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM sessions WHERE user_id=$1`, f.userID)
		_, _ = pool.Exec(ctx, `DELETE FROM memberships WHERE id=$1`, f.membershipID)
		_, _ = pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, f.userID)
		_, _ = pool.Exec(ctx, `DELETE FROM tenants WHERE id=$1`, f.tenantID)
		_, _ = pool.Exec(ctx, `DELETE FROM authz_outbox WHERE idempotency_key LIKE 'membership:'||$1::text||'%'`, f.membershipID)
	})
	return f
}

// --- tests ---------------------------------------------------------------

func TestInvitation_Lookup_Pending_ReturnsMetadata(t *testing.T) {
	f := seedInvitation(t, 14*24*time.Hour, false)
	res, err := f.svc.Lookup(f.ctx, f.rawToken)
	if err != nil {
		t.Fatalf("Lookup: %v", err)
	}
	if res.Role != "admin" {
		t.Fatalf("role = %q, want admin", res.Role)
	}
	if !res.NeedsPasswordSetup {
		t.Fatalf("NeedsPasswordSetup=false, want true (user has no password)")
	}
}

func TestInvitation_Lookup_Expired_Rejects(t *testing.T) {
	f := seedInvitation(t, -1*time.Hour, false)
	_, err := f.svc.Lookup(f.ctx, f.rawToken)
	if !errors.Is(err, repository.ErrInvitationExpired) {
		t.Fatalf("expected ErrInvitationExpired, got %v", err)
	}
}

func TestInvitation_Lookup_UnknownToken_Rejects(t *testing.T) {
	f := seedInvitation(t, 14*24*time.Hour, false)
	// Use a token that's a different shape — must not match the stored hash.
	_, err := f.svc.Lookup(f.ctx, "not-a-real-token-xxxxxxxxxxxxxxxxxxxxxxxxxx")
	if !errors.Is(err, repository.ErrInvitationNotFound) {
		t.Fatalf("expected ErrInvitationNotFound, got %v", err)
	}
}

func TestInvitation_Accept_FirstTime_RequiresPassword(t *testing.T) {
	f := seedInvitation(t, 14*24*time.Hour, false)
	_, err := f.svc.Accept(f.ctx, f.rawToken, AcceptRequest{}, "127.0.0.1", "test")
	if !errors.Is(err, ErrInvitationPasswordRequired) {
		t.Fatalf("expected ErrInvitationPasswordRequired, got %v", err)
	}
}

func TestInvitation_Accept_FirstTime_SetsPasswordActivates(t *testing.T) {
	f := seedInvitation(t, 14*24*time.Hour, false)
	res, err := f.svc.Accept(f.ctx, f.rawToken, AcceptRequest{
		Password:    "CorrectHorseBatteryStaple",
		DisplayName: "Test User",
	}, "127.0.0.1", "test")
	if err != nil {
		t.Fatalf("Accept: %v", err)
	}
	if res.TenantID != f.tenantID {
		t.Fatalf("tenant id mismatch")
	}
	// Verify DB: membership joined, user activated.
	var joinedAt *time.Time
	var status string
	var hasPw bool
	err = f.pool.QueryRow(f.ctx, `
		SELECT m.joined_at, u.status::text, (u.password_hash IS NOT NULL AND u.password_hash <> '') AS has_pw
		FROM memberships m JOIN users u ON u.id=m.user_id
		WHERE m.id=$1`, f.membershipID).Scan(&joinedAt, &status, &hasPw)
	if err != nil {
		t.Fatalf("verify DB: %v", err)
	}
	if joinedAt == nil {
		t.Fatalf("joined_at still NULL after accept")
	}
	if status != "active" {
		t.Fatalf("status=%q want active", status)
	}
	if !hasPw {
		t.Fatalf("password not written")
	}
}

func TestInvitation_Accept_ExistingUser_RejectsPassword(t *testing.T) {
	f := seedInvitation(t, 14*24*time.Hour, true /* withPassword */)
	_, err := f.svc.Accept(f.ctx, f.rawToken, AcceptRequest{
		Password: "ShouldNotBeAccepted",
	}, "127.0.0.1", "test")
	if !errors.Is(err, ErrInvitationPasswordNotAllowed) {
		t.Fatalf("expected ErrInvitationPasswordNotAllowed, got %v", err)
	}
}

func TestInvitation_Accept_ExistingUser_NoPassword_Accepts(t *testing.T) {
	f := seedInvitation(t, 14*24*time.Hour, true)
	if _, err := f.svc.Accept(f.ctx, f.rawToken, AcceptRequest{}, "127.0.0.1", "test"); err != nil {
		t.Fatalf("Accept: %v", err)
	}
	var joinedAt *time.Time
	_ = f.pool.QueryRow(f.ctx, `SELECT joined_at FROM memberships WHERE id=$1`, f.membershipID).Scan(&joinedAt)
	if joinedAt == nil {
		t.Fatalf("joined_at still NULL after accept")
	}
}

func TestInvitation_Accept_AlreadyAccepted_ReturnsResolved(t *testing.T) {
	f := seedInvitation(t, 14*24*time.Hour, false)
	if _, err := f.svc.Accept(f.ctx, f.rawToken, AcceptRequest{
		Password: "CorrectHorseBatteryStaple",
	}, "127.0.0.1", "test"); err != nil {
		t.Fatalf("first Accept: %v", err)
	}
	// Second accept with the same token — token has been cleared, so the
	// lookup itself returns ErrInvitationNotFound (it's no longer pending).
	_, err := f.svc.Accept(f.ctx, f.rawToken, AcceptRequest{
		Password: "CorrectHorseBatteryStaple",
	}, "127.0.0.1", "test")
	if !errors.Is(err, repository.ErrInvitationNotFound) {
		t.Fatalf("expected ErrInvitationNotFound on replay, got %v", err)
	}
}

func TestInvitation_Decline_SoftDeletes(t *testing.T) {
	f := seedInvitation(t, 14*24*time.Hour, false)
	if err := f.svc.Decline(f.ctx, f.rawToken); err != nil {
		t.Fatalf("Decline: %v", err)
	}
	var deletedAt *time.Time
	_ = f.pool.QueryRow(f.ctx, `SELECT deleted_at FROM memberships WHERE id=$1`, f.membershipID).Scan(&deletedAt)
	if deletedAt == nil {
		t.Fatalf("deleted_at still NULL after decline")
	}
}
