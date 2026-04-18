package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrTenantDomainNotFound — lookup by (tenant_id, id) or id miss. Also used
// when the row is soft-deleted.
var ErrTenantDomainNotFound = errors.New("tenant domain not found")

// ErrDomainAlreadyVerified — a verified claim on this domain already exists
// for another tenant. Returned by MarkVerified when the partial unique index
// rejects the flip. Callers should translate to 409.
var ErrDomainAlreadyVerified = errors.New("domain already verified by another tenant")

// TenantDomain mirrors the `tenant_domains` table (migration 000022).
type TenantDomain struct {
	ID                 uuid.UUID
	TenantID           uuid.UUID
	Domain             string
	VerificationMethod string
	VerificationToken  string
	Status             string
	IsPrimary          bool
	VerifiedAt         *time.Time
	LastCheckedAt      *time.Time
	CheckAttempts      int
	ExpiresAt          time.Time
	CreatedBy          *uuid.UUID
	CreatedAt          time.Time
	UpdatedAt          time.Time
	DeletedAt          *time.Time
}

// TenantDomainRepository owns all writes to `tenant_domains`. Reads are
// co-located here so the verification cron, the signup flow, and the
// tenant-admin UI hit the same query shapes.
type TenantDomainRepository struct {
	pool *pgxpool.Pool
}

// NewTenantDomainRepository wraps a pgxpool.
func NewTenantDomainRepository(pool *pgxpool.Pool) *TenantDomainRepository {
	return &TenantDomainRepository{pool: pool}
}

// CreateTx inserts a new pending claim inside a transaction. Used by the
// signup-org flow which bundles tenant/user/membership/claim writes.
func (r *TenantDomainRepository) CreateTx(ctx context.Context, tx pgx.Tx, d *TenantDomain) error {
	const q = `INSERT INTO tenant_domains
		(id, tenant_id, domain, verification_method, verification_token, status,
		 is_primary, expires_at, created_by, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8, $9, $9)`
	if _, err := tx.Exec(ctx, q,
		d.ID, d.TenantID, d.Domain, d.VerificationMethod, d.VerificationToken,
		d.IsPrimary, d.ExpiresAt, d.CreatedBy, d.CreatedAt,
	); err != nil {
		return fmt.Errorf("insert tenant_domain: %w", err)
	}
	return nil
}

// Create is the pool-level variant used by post-signup "add another domain"
// flows.
func (r *TenantDomainRepository) Create(ctx context.Context, d *TenantDomain) error {
	const q = `INSERT INTO tenant_domains
		(id, tenant_id, domain, verification_method, verification_token, status,
		 is_primary, expires_at, created_by, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8, $9, $9)`
	if _, err := r.pool.Exec(ctx, q,
		d.ID, d.TenantID, d.Domain, d.VerificationMethod, d.VerificationToken,
		d.IsPrimary, d.ExpiresAt, d.CreatedBy, d.CreatedAt,
	); err != nil {
		return fmt.Errorf("insert tenant_domain: %w", err)
	}
	return nil
}

// GetByID loads a single row scoped to a tenant (prevents cross-tenant
// disclosure of claim state). Soft-deleted rows return ErrTenantDomainNotFound.
func (r *TenantDomainRepository) GetByID(ctx context.Context, tenantID, id uuid.UUID) (*TenantDomain, error) {
	const q = `SELECT id, tenant_id, domain, verification_method, verification_token,
		status, is_primary, verified_at, last_checked_at, check_attempts,
		expires_at, created_by, created_at, updated_at, deleted_at
		FROM tenant_domains
		WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`
	d := &TenantDomain{}
	err := r.pool.QueryRow(ctx, q, id, tenantID).Scan(
		&d.ID, &d.TenantID, &d.Domain, &d.VerificationMethod, &d.VerificationToken,
		&d.Status, &d.IsPrimary, &d.VerifiedAt, &d.LastCheckedAt, &d.CheckAttempts,
		&d.ExpiresAt, &d.CreatedBy, &d.CreatedAt, &d.UpdatedAt, &d.DeletedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrTenantDomainNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get tenant_domain: %w", err)
	}
	return d, nil
}

// ListByTenant returns all non-deleted domain rows for a tenant, newest first.
// Includes pending, verified, failed, and expired so the admin UI can show
// the full history.
func (r *TenantDomainRepository) ListByTenant(ctx context.Context, tenantID uuid.UUID) ([]TenantDomain, error) {
	const q = `SELECT id, tenant_id, domain, verification_method, verification_token,
		status, is_primary, verified_at, last_checked_at, check_attempts,
		expires_at, created_by, created_at, updated_at, deleted_at
		FROM tenant_domains
		WHERE tenant_id = $1 AND deleted_at IS NULL
		ORDER BY created_at DESC`
	rows, err := r.pool.Query(ctx, q, tenantID)
	if err != nil {
		return nil, fmt.Errorf("list tenant_domains: %w", err)
	}
	defer rows.Close()
	out := []TenantDomain{}
	for rows.Next() {
		var d TenantDomain
		if err := rows.Scan(
			&d.ID, &d.TenantID, &d.Domain, &d.VerificationMethod, &d.VerificationToken,
			&d.Status, &d.IsPrimary, &d.VerifiedAt, &d.LastCheckedAt, &d.CheckAttempts,
			&d.ExpiresAt, &d.CreatedBy, &d.CreatedAt, &d.UpdatedAt, &d.DeletedAt,
		); err != nil {
			return nil, fmt.Errorf("scan tenant_domain: %w", err)
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// FindVerifiedByDomain returns the single tenant_domain row (if any) that has
// a verified claim on the given domain. Used by /auth/public/discover in
// Phase 3 and by the post-claim migration worker in Phase 4.
//
// Returns ErrTenantDomainNotFound when no verified row exists.
func (r *TenantDomainRepository) FindVerifiedByDomain(ctx context.Context, domain string) (*TenantDomain, error) {
	const q = `SELECT id, tenant_id, domain, verification_method, verification_token,
		status, is_primary, verified_at, last_checked_at, check_attempts,
		expires_at, created_by, created_at, updated_at, deleted_at
		FROM tenant_domains
		WHERE domain = $1 AND status = 'verified' AND deleted_at IS NULL
		LIMIT 1`
	d := &TenantDomain{}
	err := r.pool.QueryRow(ctx, q, domain).Scan(
		&d.ID, &d.TenantID, &d.Domain, &d.VerificationMethod, &d.VerificationToken,
		&d.Status, &d.IsPrimary, &d.VerifiedAt, &d.LastCheckedAt, &d.CheckAttempts,
		&d.ExpiresAt, &d.CreatedBy, &d.CreatedAt, &d.UpdatedAt, &d.DeletedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrTenantDomainNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("find verified domain: %w", err)
	}
	return d, nil
}

// ListPendingForCheck picks up to `limit` pending, non-expired rows, ordered
// by last_checked_at (nulls first — new claims get checked immediately).
// Used by the background verification cron.
func (r *TenantDomainRepository) ListPendingForCheck(ctx context.Context, limit int) ([]TenantDomain, error) {
	const q = `SELECT id, tenant_id, domain, verification_method, verification_token,
		status, is_primary, verified_at, last_checked_at, check_attempts,
		expires_at, created_by, created_at, updated_at, deleted_at
		FROM tenant_domains
		WHERE status = 'pending' AND expires_at > NOW() AND deleted_at IS NULL
		ORDER BY last_checked_at NULLS FIRST
		LIMIT $1`
	rows, err := r.pool.Query(ctx, q, limit)
	if err != nil {
		return nil, fmt.Errorf("list pending: %w", err)
	}
	defer rows.Close()
	out := []TenantDomain{}
	for rows.Next() {
		var d TenantDomain
		if err := rows.Scan(
			&d.ID, &d.TenantID, &d.Domain, &d.VerificationMethod, &d.VerificationToken,
			&d.Status, &d.IsPrimary, &d.VerifiedAt, &d.LastCheckedAt, &d.CheckAttempts,
			&d.ExpiresAt, &d.CreatedBy, &d.CreatedAt, &d.UpdatedAt, &d.DeletedAt,
		); err != nil {
			return nil, fmt.Errorf("scan pending: %w", err)
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// RecordCheckAttempt bumps check_attempts + last_checked_at without changing
// status. Called after every DNS lookup regardless of outcome so operators
// can tell a domain is being polled.
func (r *TenantDomainRepository) RecordCheckAttempt(ctx context.Context, id uuid.UUID) error {
	const q = `UPDATE tenant_domains
		SET last_checked_at = NOW(), check_attempts = check_attempts + 1
		WHERE id = $1 AND deleted_at IS NULL`
	if _, err := r.pool.Exec(ctx, q, id); err != nil {
		return fmt.Errorf("record check attempt: %w", err)
	}
	return nil
}

// MarkVerified atomically flips status to 'verified' if still 'pending', then
// attempts to set is_primary=TRUE via a separate race-safe UPDATE.
//
// Two writes rather than one because the `is_primary` invariant ("at most one
// primary verified domain per tenant") is enforced by partial unique index
// `uq_tenant_domains_primary_per_tenant` (migration 000023). Putting both
// flips in a single UPDATE with a correlated subquery races — the subquery
// runs at statement start, so two concurrent verifications for the same
// tenant would both see "no primary exists" and both flip to TRUE.
//
// Translation of DB errors:
//   - 23505 on the status flip → ErrDomainAlreadyVerified (another tenant
//     won the global verified-per-domain race from migration 000022).
//   - 23505 on the is_primary flip → benign; another domain for this tenant
//     verified first and grabbed primary. Row stays verified with is_primary=FALSE.
//   - 0 rows affected on the status flip → row was deleted or already
//     past pending. Return ErrTenantDomainNotFound.
//
// Phase 4 note: callers that also need to enqueue a `tenant.domain.verified`
// event atomically with the flip should call MarkVerifiedTx / PromotePrimary
// separately — the status flip goes in the outbox transaction, the primary
// promotion stays out of it so a lost-primary-race doesn't roll back the
// event emission.
func (r *TenantDomainRepository) MarkVerified(ctx context.Context, id uuid.UUID) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin mark verified: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if err := r.MarkVerifiedTx(ctx, tx, id); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit mark verified: %w", err)
	}
	return r.PromotePrimary(ctx, id)
}

// MarkVerifiedTx is the transactional status flip. Use this when you want to
// emit a `tenant.domain.verified` event into the event_outbox in the same
// transaction as the flip itself (Phase 4 outbox pattern). Does NOT promote
// to primary — call PromotePrimary after the tx commits.
//
// Error translation matches MarkVerified: ErrDomainAlreadyVerified on unique
// conflict, ErrTenantDomainNotFound when no pending row remained.
func (r *TenantDomainRepository) MarkVerifiedTx(ctx context.Context, tx pgx.Tx, id uuid.UUID) error {
	const flip = `UPDATE tenant_domains
		SET status = 'verified',
		    verified_at = NOW(),
		    last_checked_at = NOW()
		WHERE id = $1 AND status = 'pending' AND deleted_at IS NULL`
	tag, err := tx.Exec(ctx, flip, id)
	if err != nil {
		if isDuplicateKey(err) {
			return ErrDomainAlreadyVerified
		}
		return fmt.Errorf("mark verified (tx): %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrTenantDomainNotFound
	}
	return nil
}

// PromotePrimary flips is_primary=TRUE on a freshly-verified row iff no other
// verified-primary exists for the same tenant. Benign race: the partial
// unique index rejects concurrent promotions and we swallow the resulting
// 23505 because losing the race means the row stays verified+non-primary,
// which is a valid end state.
func (r *TenantDomainRepository) PromotePrimary(ctx context.Context, id uuid.UUID) error {
	const promote = `UPDATE tenant_domains td
		SET is_primary = TRUE
		WHERE td.id = $1
		  AND td.status = 'verified'
		  AND td.deleted_at IS NULL
		  AND td.is_primary = FALSE
		  AND NOT EXISTS (
		      SELECT 1 FROM tenant_domains
		      WHERE tenant_id = td.tenant_id
		        AND status = 'verified'
		        AND deleted_at IS NULL
		        AND is_primary = TRUE
		        AND id <> td.id
		  )`
	if _, err := r.pool.Exec(ctx, promote, id); err != nil {
		if isDuplicateKey(err) {
			return nil
		}
		return fmt.Errorf("promote primary: %w", err)
	}
	return nil
}

// MarkExpired flips pending rows past their expires_at to status='expired'.
// Called by the cron as a side effect of scanning pending rows.
func (r *TenantDomainRepository) MarkExpired(ctx context.Context, id uuid.UUID) error {
	const q = `UPDATE tenant_domains
		SET status = 'expired'
		WHERE id = $1 AND status = 'pending' AND deleted_at IS NULL`
	if _, err := r.pool.Exec(ctx, q, id); err != nil {
		return fmt.Errorf("mark expired: %w", err)
	}
	return nil
}

// SoftDelete marks a claim as deleted_at=NOW(). Does not free the domain
// for another tenant immediately — that's what `expires_at` + admin revoke
// is for (beyond Phase 2 scope).
func (r *TenantDomainRepository) SoftDelete(ctx context.Context, tenantID, id uuid.UUID) error {
	const q = `UPDATE tenant_domains
		SET deleted_at = NOW()
		WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`
	tag, err := r.pool.Exec(ctx, q, id, tenantID)
	if err != nil {
		return fmt.Errorf("soft delete: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrTenantDomainNotFound
	}
	return nil
}
