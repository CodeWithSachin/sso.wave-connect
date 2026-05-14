package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/wave-connect/sso-platform/apps/identity-service/internal/model"
)

var ErrMembershipNotFound = errors.New("membership not found")

type MembershipRepository struct {
	pool *pgxpool.Pool
}

func NewMembershipRepository(pool *pgxpool.Pool) *MembershipRepository {
	return &MembershipRepository{pool: pool}
}

func (r *MembershipRepository) Create(ctx context.Context, m *model.Membership) error {
	const q = `INSERT INTO memberships (id, user_id, tenant_id, role, joined_at, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)`
	_, err := r.pool.Exec(ctx, q,
		m.ID, m.UserID, m.TenantID, m.Role, m.JoinedAt, m.CreatedAt, m.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("insert membership: %w", err)
	}
	return nil
}

// TenantMembership is the projection returned by ListTenantsForUser — used
// by Phase 5's /auth/session/memberships endpoint. Joins tenants ← memberships
// so the picker UI can render names/slugs without a second round-trip.
type TenantMembership struct {
	TenantID         uuid.UUID
	TenantSlug       string
	TenantName       string
	TenantKind       string
	Role             string
	JoinedAt         *time.Time
	TenantDeletedAt  *time.Time
}

// ListTenantsForUser returns every non-deleted tenant the user has a
// non-deleted membership in. Ordered by joined_at ascending so the UI can
// anchor the list on "original tenant first, newer joins after" — matches
// the order a user would naturally remember them.
func (r *MembershipRepository) ListTenantsForUser(ctx context.Context, userID uuid.UUID) ([]TenantMembership, error) {
	const q = `SELECT t.id, t.slug, t.display_name, t.tenant_kind::text, m.role, m.joined_at, t.deleted_at
		FROM memberships m
		JOIN tenants t ON t.id = m.tenant_id
		WHERE m.user_id = $1
		  AND m.deleted_at IS NULL
		  AND t.deleted_at IS NULL
		ORDER BY m.joined_at ASC NULLS LAST`
	rows, err := r.pool.Query(ctx, q, userID)
	if err != nil {
		return nil, fmt.Errorf("list tenant memberships: %w", err)
	}
	defer rows.Close()
	out := []TenantMembership{}
	for rows.Next() {
		var tm TenantMembership
		if err := rows.Scan(
			&tm.TenantID, &tm.TenantSlug, &tm.TenantName, &tm.TenantKind,
			&tm.Role, &tm.JoinedAt, &tm.TenantDeletedAt,
		); err != nil {
			return nil, fmt.Errorf("scan tenant membership: %w", err)
		}
		out = append(out, tm)
	}
	return out, rows.Err()
}

func (r *MembershipRepository) GetByUserAndTenant(ctx context.Context, userID, tenantID uuid.UUID) (*model.Membership, error) {
	const q = `SELECT id, user_id, tenant_id, role, joined_at, created_at, updated_at
		FROM memberships WHERE user_id = $1 AND tenant_id = $2`
	m := &model.Membership{}
	err := r.pool.QueryRow(ctx, q, userID, tenantID).Scan(
		&m.ID, &m.UserID, &m.TenantID, &m.Role, &m.JoinedAt, &m.CreatedAt, &m.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrMembershipNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get membership: %w", err)
	}
	return m, nil
}
