package repository

import (
	"context"
	"errors"
	"fmt"

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
