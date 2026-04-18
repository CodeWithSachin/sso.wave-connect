// Package service — migration.go
//
// Phase 4 post-claim user migration. Public entry points:
//
//	MigrationService.Accept — user clicks "join organization" from the offer
//	                          email. Moves membership, soft-deletes personal
//	                          tenant, revokes sessions. One transaction.
//	MigrationService.Decline — user keeps their personal workspace.
//	MigrationService.NotifyForce — owner-triggered: sends the 7-day heads-up
//	                          email before a force-move.
//	MigrationService.Force — owner-triggered: actually performs the force-
//	                          move after the notify window has elapsed.
//
// All state changes pair with an event.Outbox enqueue inside the same tx so
// downstream consumers (audit log, webhook dispatcher) see the resolution.
package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog"

	"github.com/wave-connect/sso-platform/apps/identity-service/internal/email"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/event"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/repository"
)

// ErrMigrationExpired — the offer's grace period has passed. User-facing
// flows return 410 Gone; admin force-migrate flows treat this as the cue
// that force is allowed.
var ErrMigrationExpired = errors.New("migration offer expired")

// ErrMigrationAlreadyResolved — row is no longer 'offered'. Token was
// already used (accepted / declined / force_moved).
var ErrMigrationAlreadyResolved = errors.New("migration already resolved")

// ErrMigrationNotForcible — admin tried to force-migrate a row that's still
// within its grace window and hasn't been declined.
var ErrMigrationNotForcible = errors.New("migration is not eligible for force-move")

// ErrForceNoticeTooRecent — admin tried to force-move before the 7-day
// heads-up email period elapsed. Prevents accidental instant overrides.
var ErrForceNoticeTooRecent = errors.New("force-move notice must run at least 7 days before force-move")

// MigrationService wraps the accept/decline/force operations. Kept separate
// from DomainVerifyService because the shapes diverge and the worker is a
// distinct concern.
type MigrationService struct {
	pool            *pgxpool.Pool
	migRepo         *repository.TenantDomainMigrationRepository
	sessionRepo     *repository.SessionRepository
	outbox          *event.Outbox
	authzOutboxRepo *repository.AuthzOutboxRepository
	emailProvider   email.Provider
	senderAddress   string
	log             zerolog.Logger
}

// MigrationServiceDeps keeps the constructor signature stable.
type MigrationServiceDeps struct {
	Pool            *pgxpool.Pool
	MigrationRepo   *repository.TenantDomainMigrationRepository
	SessionRepo     *repository.SessionRepository
	Outbox          *event.Outbox
	AuthzOutboxRepo *repository.AuthzOutboxRepository
	EmailProvider   email.Provider
	SenderAddress   string
	Log             zerolog.Logger
}

// ForceNoticeWindow is the required delay between MarkForceNotified and Force
// — gives the user a final chance to accept on their own.
const ForceNoticeWindow = 7 * 24 * time.Hour

// NewMigrationService wires the service.
func NewMigrationService(deps MigrationServiceDeps) *MigrationService {
	return &MigrationService{
		pool:            deps.Pool,
		migRepo:         deps.MigrationRepo,
		sessionRepo:     deps.SessionRepo,
		outbox:          deps.Outbox,
		authzOutboxRepo: deps.AuthzOutboxRepo,
		emailProvider:   deps.EmailProvider,
		senderAddress:   deps.SenderAddress,
		log:             deps.Log.With().Str("component", "migration_service").Logger(),
	}
}

// ── public entry points ─────────────────────────────────────────────────────

// Accept moves the user out of their personal tenant and into the org.
// Idempotent at the token level: a second call with the same token returns
// ErrMigrationAlreadyResolved.
//
// Transaction contents:
//  1. UPDATE migration status 'offered' → 'accepted'.
//  2. DELETE the owner membership in the personal tenant.
//  3. INSERT a 'member' membership in the org tenant (ON CONFLICT DO NOTHING
//     — defensive against a duplicate org membership that somehow slipped
//     past the worker's EXISTS check).
//  4. UPDATE tenants SET deleted_at=NOW() for the personal tenant (scoped
//     to max_users=1 AND tenant_kind='personal' so we never accidentally
//     soft-delete a shared workspace).
//  5. Revoke all active sessions for the user (force re-login).
//  6. Outbox enqueue: user.migration.accepted.
func (s *MigrationService) Accept(ctx context.Context, token string) (*repository.TenantDomainMigration, error) {
	row, err := s.loadOfferedOrError(ctx, token)
	if err != nil {
		return nil, err
	}

	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, fmt.Errorf("begin accept tx: %w", err)
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback(ctx)
		}
	}()

	if err := s.migRepo.UpdateStatusTx(ctx, tx, row.ID, "accepted"); err != nil {
		if errors.Is(err, repository.ErrMigrationNotFound) {
			// Raced with another accept/decline call after loadOfferedOrError.
			return nil, ErrMigrationAlreadyResolved
		}
		return nil, fmt.Errorf("update status: %w", err)
	}

	fromRole, err := s.moveMembershipTx(ctx, tx, row)
	if err != nil {
		return nil, err
	}

	if err := s.softDeletePersonalTenantTx(ctx, tx, row.FromTenantID); err != nil {
		return nil, err
	}

	// Revoke *all* active sessions for the user across every tenant they
	// belong to, not just the personal tenant being vacated. Intentional:
	// the membership move changes the user's effective tenant context, so
	// leaving any existing session alive would mean the user transiently
	// sees old-tenant data under a new membership. Plan acceptance criteria
	// explicitly calls for this ("force re-login").
	if _, err := s.sessionRepo.RevokeAllByUserTx(ctx, tx, row.UserID, "domain_migration_accepted"); err != nil {
		return nil, fmt.Errorf("revoke sessions: %w", err)
	}

	// Accept is user-initiated; actor is the user themselves.
	if err := enqueueMigrationTupleMove(ctx, tx, s.authzOutboxRepo,
		row.ID, row.UserID, row.FromTenantID, row.ToTenantID, fromRole, &row.UserID,
	); err != nil {
		return nil, err
	}

	if err := s.enqueueResolvedTx(ctx, tx, row, "accepted"); err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit accept: %w", err)
	}
	committed = true

	s.log.Info().
		Str("migration_id", row.ID.String()).
		Str("user_id", row.UserID.String()).
		Str("from_tenant", row.FromTenantID.String()).
		Str("to_tenant", row.ToTenantID.String()).
		Msg("migration accepted")
	return row, nil
}

// Decline marks the offer declined and emits the event. State is otherwise
// untouched — the user keeps their personal workspace and the org owner
// can later force-migrate once the row's expires_at passes.
func (s *MigrationService) Decline(ctx context.Context, token string) (*repository.TenantDomainMigration, error) {
	row, err := s.loadOfferedOrError(ctx, token)
	if err != nil {
		return nil, err
	}

	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, fmt.Errorf("begin decline tx: %w", err)
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback(ctx)
		}
	}()

	if err := s.migRepo.UpdateStatusTx(ctx, tx, row.ID, "declined"); err != nil {
		if errors.Is(err, repository.ErrMigrationNotFound) {
			return nil, ErrMigrationAlreadyResolved
		}
		return nil, fmt.Errorf("update status: %w", err)
	}
	if err := s.enqueueResolvedTx(ctx, tx, row, "declined"); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit decline: %w", err)
	}
	committed = true

	s.log.Info().
		Str("migration_id", row.ID.String()).
		Str("user_id", row.UserID.String()).
		Msg("migration declined")
	return row, nil
}

// NotifyForce sends the 7-day heads-up email and stamps force_notified_at.
// Idempotent: if force_notified_at is already set, the stamp stays and no
// second email goes out. Admin-only path; handler must check caller is an
// owner of row.ToTenantID before calling.
func (s *MigrationService) NotifyForce(ctx context.Context, migrationID uuid.UUID, userEmail string) (*repository.TenantDomainMigration, error) {
	row, err := s.migRepo.GetByID(ctx, migrationID)
	if err != nil {
		return nil, err
	}
	if row.Status != "offered" && row.Status != "declined" && row.Status != "expired" {
		return nil, ErrMigrationAlreadyResolved
	}
	if row.ForceNotifiedAt != nil {
		// Already sent — idempotent.
		return row, nil
	}
	if err := s.migRepo.MarkForceNotified(ctx, row.ID); err != nil {
		return nil, err
	}
	s.sendForceNoticeEmail(ctx, userEmail, row)
	s.log.Info().
		Str("migration_id", row.ID.String()).
		Str("user_id", row.UserID.String()).
		Msg("migration force-notice sent")
	// Re-load so callers see force_notified_at populated.
	return s.migRepo.GetByID(ctx, row.ID)
}

// Force performs the actual force-move. Guarded by:
//   - status must be 'offered', 'declined', or 'expired' (not already resolved),
//   - force_notified_at must be at least ForceNoticeWindow in the past,
//   - either expires_at has passed OR status is 'declined' (per the plan's
//     force-migration authority).
//
// `actorID` is the admin user invoking the force-move — threaded through to
// the outbox tuple write and the resolved event so audit logs name the
// actor, not the migrated user. ReBAC middleware already verified this
// actor is an `admin` on row.ToTenantID before calling.
//
// Handler must still check the caller is an owner of row.ToTenantID.
func (s *MigrationService) Force(ctx context.Context, migrationID, actorID uuid.UUID) (*repository.TenantDomainMigration, error) {
	row, err := s.migRepo.GetByID(ctx, migrationID)
	if err != nil {
		return nil, err
	}
	if row.Status == "accepted" || row.Status == "force_moved" {
		return nil, ErrMigrationAlreadyResolved
	}
	// Force is legal iff the grace is up OR the user declined.
	if time.Now().Before(row.ExpiresAt) && row.Status != "declined" {
		return nil, ErrMigrationNotForcible
	}
	if row.ForceNotifiedAt == nil || time.Since(*row.ForceNotifiedAt) < ForceNoticeWindow {
		return nil, ErrForceNoticeTooRecent
	}

	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, fmt.Errorf("begin force tx: %w", err)
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback(ctx)
		}
	}()

	if err := s.migRepo.UpdateStatusTx(ctx, tx, row.ID, "force_moved"); err != nil {
		if errors.Is(err, repository.ErrMigrationNotFound) {
			return nil, ErrMigrationAlreadyResolved
		}
		return nil, err
	}
	fromRole, err := s.moveMembershipTx(ctx, tx, row)
	if err != nil {
		return nil, err
	}
	if err := s.softDeletePersonalTenantTx(ctx, tx, row.FromTenantID); err != nil {
		return nil, err
	}
	if _, err := s.sessionRepo.RevokeAllByUserTx(ctx, tx, row.UserID, "domain_migration_forced"); err != nil {
		return nil, fmt.Errorf("revoke sessions: %w", err)
	}
	// Force is admin-initiated; actor is the org admin who invoked it.
	if err := enqueueMigrationTupleMove(ctx, tx, s.authzOutboxRepo,
		row.ID, row.UserID, row.FromTenantID, row.ToTenantID, fromRole, &actorID,
	); err != nil {
		return nil, err
	}
	if err := s.enqueueResolvedTxWithActor(ctx, tx, row, "force_moved", actorID); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit force: %w", err)
	}
	committed = true

	s.log.Warn().
		Str("migration_id", row.ID.String()).
		Str("user_id", row.UserID.String()).
		Str("actor_id", actorID.String()).
		Msg("migration force-moved by org owner")
	return row, nil
}

// ── internals ───────────────────────────────────────────────────────────────

// loadOfferedOrError centralizes the token → row lookup + pre-commit checks
// so Accept / Decline share a single source of truth for "is this offer
// still actionable from the user's perspective?".
func (s *MigrationService) loadOfferedOrError(ctx context.Context, token string) (*repository.TenantDomainMigration, error) {
	row, err := s.migRepo.GetByToken(ctx, token)
	if err != nil {
		return nil, err
	}
	if row.Status != "offered" {
		return nil, ErrMigrationAlreadyResolved
	}
	if time.Now().After(row.ExpiresAt) {
		return nil, ErrMigrationExpired
	}
	return row, nil
}

// moveMembershipTx deletes the user's personal-tenant membership and inserts
// a 'member' membership in the org. Scoped by (user_id, from_tenant_id) to
// avoid touching memberships in unrelated tenants the user might hold.
//
// Returns the role that was on the personal tenant — caller uses it to
// emit the correct FGA delete tuple. Missing row returns ("", nil): the
// migration's DB state change still proceeds, tuple delete becomes a no-op.
func (s *MigrationService) moveMembershipTx(ctx context.Context, tx pgx.Tx, row *repository.TenantDomainMigration) (string, error) {
	// Look up the current role before the DELETE so we can emit the
	// matching FGA tuple delete. Using DELETE ... RETURNING collapses the
	// read + write into one round-trip.
	var fromRole string
	err := tx.QueryRow(ctx, `
		DELETE FROM memberships
		WHERE user_id = $1 AND tenant_id = $2
		RETURNING role
	`, row.UserID, row.FromTenantID).Scan(&fromRole)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return "", fmt.Errorf("delete personal membership: %w", err)
	}
	// No row → user was already removed from the personal tenant somehow.
	// Not fatal — the migration still moves forward.

	// ON CONFLICT DO NOTHING protects against a rare race where the worker
	// somehow produced an offer for a user who is already a member of the
	// org (shouldn't happen per ListCandidatesForDomain's EXISTS filter, but
	// this keeps the happy path correct even if that invariant ever slips).
	if _, err := tx.Exec(ctx, `
		INSERT INTO memberships (id, user_id, tenant_id, role, joined_at, created_at, updated_at)
		VALUES (gen_random_uuid(), $1, $2, 'member', NOW(), NOW(), NOW())
		ON CONFLICT DO NOTHING
	`, row.UserID, row.ToTenantID); err != nil {
		return "", fmt.Errorf("insert org membership: %w", err)
	}
	return fromRole, nil
}

// softDeletePersonalTenantTx flips tenants.deleted_at on the vacated tenant.
// Scoped to max_users=1 AND tenant_kind='personal' as a guard — we never
// want an admin UI bug to soft-delete a shared org workspace.
func (s *MigrationService) softDeletePersonalTenantTx(ctx context.Context, tx pgx.Tx, personalTenantID uuid.UUID) error {
	if _, err := tx.Exec(ctx, `
		UPDATE tenants
		SET deleted_at = NOW()
		WHERE id = $1
		  AND tenant_kind = 'personal'
		  AND max_users = 1
		  AND deleted_at IS NULL
	`, personalTenantID); err != nil {
		return fmt.Errorf("soft-delete personal tenant: %w", err)
	}
	return nil
}

// enqueueResolvedTx writes the `user.migration.(accepted|declined)` outbox
// row atomically with the state change. Actor is the user themselves.
func (s *MigrationService) enqueueResolvedTx(ctx context.Context, tx pgx.Tx, row *repository.TenantDomainMigration, resolution string) error {
	return s.enqueueResolvedTxWithActor(ctx, tx, row, resolution, row.UserID)
}

// enqueueResolvedTxWithActor is the force-move variant — the actor is the
// org admin who invoked `Force`, not the migrated user. Keeps audit trails
// accurate ("user.migration.force_moved" should name the admin).
func (s *MigrationService) enqueueResolvedTxWithActor(ctx context.Context, tx pgx.Tx, row *repository.TenantDomainMigration, resolution string, actorID uuid.UUID) error {
	var typ string
	switch resolution {
	case "accepted":
		typ = event.TypeUserMigrationAccepted
	case "declined":
		typ = event.TypeUserMigrationDeclined
	case "force_moved":
		typ = event.TypeUserMigrationForceMoved
	default:
		return fmt.Errorf("unknown resolution %q", resolution)
	}
	now := time.Now().UTC()
	return s.outbox.EnqueueTx(ctx, tx, event.Event{
		Type:      typ,
		Timestamp: now,
		TenantID:  row.ToTenantID,
		ActorID:   actorID,
		Payload: event.UserMigrationResolvedPayload{
			MigrationID:  row.ID,
			UserID:       row.UserID,
			FromTenantID: row.FromTenantID,
			ToTenantID:   row.ToTenantID,
			Domain:       row.Domain,
			Resolution:   resolution,
			ResolvedAt:   now,
		},
	})
}

// sendForceNoticeEmail best-effort warns the user that the org owner is
// about to force-migrate them. Failures don't block the notify flow.
func (s *MigrationService) sendForceNoticeEmail(ctx context.Context, to string, row *repository.TenantDomainMigration) {
	if strings.TrimSpace(to) == "" {
		return
	}
	body := fmt.Sprintf(
		`We're letting you know that the owner of %s is about to move your account into the team workspace.

This happens in 7 days unless you choose to join voluntarily first (which keeps your preferences intact) or contact the org's admin to cancel.

After %s, your personal workspace for this account will be closed and your sessions ended.

— WaveConnect`,
		row.Domain,
		row.Domain,
	)
	msg := email.Message{
		To:             to,
		From:           s.senderAddress,
		Subject:        fmt.Sprintf("Heads-up: your %s workspace will move in 7 days", row.Domain),
		Text:           body,
		IdempotencyKey: "migration-force-notice:" + row.ID.String(),
		Tags:           map[string]string{"category": "migration_force_notice"},
	}
	if _, err := s.emailProvider.Send(ctx, msg); err != nil {
		s.log.Warn().Err(err).Str("to", to).Msg("force-notice email failed")
	}
}
