// Package repository — tenant_domain_migration.go
//
// Phase 4. Owns the `tenant_domain_migrations` table (migration 000025) and
// the supporting queries the migration worker, accept/decline handler, and
// admin force-migrate endpoint all share.
//
// The migration worker needs one "find candidates on this domain" query that
// joins users → memberships → tenants; that query is the most interesting
// thing in this file. Everything else is straightforward CRUD.
package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrMigrationNotFound — token lookup miss or already-consumed row.
var ErrMigrationNotFound = errors.New("tenant domain migration not found")

// ErrMigrationAlreadyOffered — a row already exists for (user, org). The
// worker treats this as benign (idempotent re-delivery of the verified
// event) and moves on without re-sending the email.
var ErrMigrationAlreadyOffered = errors.New("migration already offered to user for this org")

// TenantDomainMigration mirrors the table row exactly.
type TenantDomainMigration struct {
	ID                uuid.UUID
	UserID            uuid.UUID
	FromTenantID      uuid.UUID
	ToTenantID        uuid.UUID
	Domain            string
	Status            string
	OfferedAt         time.Time
	RespondedAt       *time.Time
	ExpiresAt         time.Time
	NotificationToken string
	ForceNotifiedAt   *time.Time
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

// MigrationCandidate is the projection returned by ListCandidatesForDomain —
// exactly the fields the worker needs to (a) decide whether to offer, (b)
// insert the migration row, and (c) address the email.
type MigrationCandidate struct {
	UserID         uuid.UUID
	Email          string
	DisplayName    string
	FromTenantID   uuid.UUID
	FromTenantName string
}

// TenantDomainMigrationRepository wraps the migrations table.
type TenantDomainMigrationRepository struct {
	pool *pgxpool.Pool
}

// NewTenantDomainMigrationRepository wraps a pgxpool.
func NewTenantDomainMigrationRepository(pool *pgxpool.Pool) *TenantDomainMigrationRepository {
	return &TenantDomainMigrationRepository{pool: pool}
}

// ListCandidatesForDomain finds users who should receive a migration offer
// when `domain` is verified by `targetTenantID`. Criteria:
//
//   - user's email has exactly `domain` as its RHS (split_part @ 2),
//   - user belongs to at least one personal tenant (tenant_kind='personal'),
//   - user is NOT already a member of the target org,
//   - neither user nor tenant is soft-deleted.
//
// Returns one candidate row per personal-tenant membership. In the current
// data model a user has at most one personal tenant (enforced by the
// partial unique index from Phase 0) so this will rarely return >1 row per
// user — but we don't assume it.
func (r *TenantDomainMigrationRepository) ListCandidatesForDomain(ctx context.Context, domain string, targetTenantID uuid.UUID) ([]MigrationCandidate, error) {
	const q = `SELECT u.id, u.email, u.display_name, t.id, t.name
		FROM users u
		JOIN memberships m ON m.user_id = u.id
		JOIN tenants t     ON t.id = m.tenant_id
		WHERE split_part(u.email, '@', 2) = LOWER($1)
		  AND t.tenant_kind = 'personal'
		  AND t.deleted_at IS NULL
		  AND u.deleted_at IS NULL
		  AND NOT EXISTS (
		      SELECT 1 FROM memberships m2
		      WHERE m2.user_id = u.id AND m2.tenant_id = $2
		  )`
	rows, err := r.pool.Query(ctx, q, domain, targetTenantID)
	if err != nil {
		return nil, fmt.Errorf("list migration candidates: %w", err)
	}
	defer rows.Close()

	out := []MigrationCandidate{}
	for rows.Next() {
		var c MigrationCandidate
		if err := rows.Scan(&c.UserID, &c.Email, &c.DisplayName, &c.FromTenantID, &c.FromTenantName); err != nil {
			return nil, fmt.Errorf("scan candidate: %w", err)
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// Create inserts one offer row. Returns ErrMigrationAlreadyOffered when the
// (user, org) unique constraint trips — the worker treats this as a benign
// duplicate (retry of the same verified event).
func (r *TenantDomainMigrationRepository) Create(ctx context.Context, m *TenantDomainMigration) error {
	return r.execInsert(ctx, m, r.pool.Exec)
}

// CreateTx is the transactional variant. The worker uses this to write the
// row + emit the `user.migration.offered` outbox event atomically.
func (r *TenantDomainMigrationRepository) CreateTx(ctx context.Context, tx pgx.Tx, m *TenantDomainMigration) error {
	return r.execInsert(ctx, m, tx.Exec)
}

// execInsert DRYs the Create / CreateTx query so both paths stay in sync.
// `exec` is pool.Exec or tx.Exec — pgx's signatures agree on (ctx,sql,args,…) → (pgconn.CommandTag, error).
func (r *TenantDomainMigrationRepository) execInsert(
	ctx context.Context,
	m *TenantDomainMigration,
	exec func(context.Context, string, ...any) (pgconn.CommandTag, error),
) error {
	const q = `INSERT INTO tenant_domain_migrations
		(id, user_id, from_tenant_id, to_tenant_id, domain, status,
		 offered_at, expires_at, notification_token, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, 'offered', $6, $7, $8, $6, $6)`
	if _, err := exec(ctx, q,
		m.ID, m.UserID, m.FromTenantID, m.ToTenantID, m.Domain,
		m.OfferedAt, m.ExpiresAt, m.NotificationToken,
	); err != nil {
		if isDuplicateKey(err) {
			return ErrMigrationAlreadyOffered
		}
		return fmt.Errorf("insert migration: %w", err)
	}
	return nil
}

// GetByToken looks up a migration by its single-use notification token.
// Used by the public accept/decline handlers.
func (r *TenantDomainMigrationRepository) GetByToken(ctx context.Context, token string) (*TenantDomainMigration, error) {
	const q = `SELECT id, user_id, from_tenant_id, to_tenant_id, domain, status,
		offered_at, responded_at, expires_at, notification_token, force_notified_at,
		created_at, updated_at
		FROM tenant_domain_migrations
		WHERE notification_token = $1`
	m := &TenantDomainMigration{}
	err := r.pool.QueryRow(ctx, q, token).Scan(
		&m.ID, &m.UserID, &m.FromTenantID, &m.ToTenantID, &m.Domain, &m.Status,
		&m.OfferedAt, &m.RespondedAt, &m.ExpiresAt, &m.NotificationToken, &m.ForceNotifiedAt,
		&m.CreatedAt, &m.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrMigrationNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get migration by token: %w", err)
	}
	return m, nil
}

// GetByID looks up a migration by primary key. Used by the admin force-migrate
// flow which is scoped by org via the caller's auth, not by token.
func (r *TenantDomainMigrationRepository) GetByID(ctx context.Context, id uuid.UUID) (*TenantDomainMigration, error) {
	const q = `SELECT id, user_id, from_tenant_id, to_tenant_id, domain, status,
		offered_at, responded_at, expires_at, notification_token, force_notified_at,
		created_at, updated_at
		FROM tenant_domain_migrations
		WHERE id = $1`
	m := &TenantDomainMigration{}
	err := r.pool.QueryRow(ctx, q, id).Scan(
		&m.ID, &m.UserID, &m.FromTenantID, &m.ToTenantID, &m.Domain, &m.Status,
		&m.OfferedAt, &m.RespondedAt, &m.ExpiresAt, &m.NotificationToken, &m.ForceNotifiedAt,
		&m.CreatedAt, &m.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrMigrationNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get migration by id: %w", err)
	}
	return m, nil
}

// UpdateStatusTx flips an offered row to a terminal status atomically with
// other writes in the caller's transaction (membership move, tenant soft-
// delete, session revoke). Accepts only legal transitions: offered →
// accepted/declined/force_moved/expired. Returns ErrMigrationNotFound if the
// row is no longer in 'offered' status (double-click resistance).
func (r *TenantDomainMigrationRepository) UpdateStatusTx(ctx context.Context, tx pgx.Tx, id uuid.UUID, newStatus string) error {
	const q = `UPDATE tenant_domain_migrations
		SET status = $2, responded_at = NOW()
		WHERE id = $1 AND status = 'offered'`
	tag, err := tx.Exec(ctx, q, id, newStatus)
	if err != nil {
		return fmt.Errorf("update migration status: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrMigrationNotFound
	}
	return nil
}

// MarkForceNotified stamps force_notified_at. Called when the 7-day heads-up
// email is dispatched, before the actual force-move. Two-phase by design so
// the user gets a final nudge before the org overrides their decision.
func (r *TenantDomainMigrationRepository) MarkForceNotified(ctx context.Context, id uuid.UUID) error {
	const q = `UPDATE tenant_domain_migrations
		SET force_notified_at = NOW()
		WHERE id = $1 AND force_notified_at IS NULL`
	if _, err := r.pool.Exec(ctx, q, id); err != nil {
		return fmt.Errorf("mark force notified: %w", err)
	}
	return nil
}

// ListByToOrg returns all migration rows targeting `toTenantID`. Used by
// the admin UI to show the migration dashboard.
func (r *TenantDomainMigrationRepository) ListByToOrg(ctx context.Context, toTenantID uuid.UUID) ([]TenantDomainMigration, error) {
	const q = `SELECT id, user_id, from_tenant_id, to_tenant_id, domain, status,
		offered_at, responded_at, expires_at, notification_token, force_notified_at,
		created_at, updated_at
		FROM tenant_domain_migrations
		WHERE to_tenant_id = $1
		ORDER BY offered_at DESC`
	rows, err := r.pool.Query(ctx, q, toTenantID)
	if err != nil {
		return nil, fmt.Errorf("list migrations by org: %w", err)
	}
	defer rows.Close()
	out := []TenantDomainMigration{}
	for rows.Next() {
		var m TenantDomainMigration
		if err := rows.Scan(
			&m.ID, &m.UserID, &m.FromTenantID, &m.ToTenantID, &m.Domain, &m.Status,
			&m.OfferedAt, &m.RespondedAt, &m.ExpiresAt, &m.NotificationToken, &m.ForceNotifiedAt,
			&m.CreatedAt, &m.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan migration: %w", err)
		}
		out = append(out, m)
	}
	return out, rows.Err()
}
