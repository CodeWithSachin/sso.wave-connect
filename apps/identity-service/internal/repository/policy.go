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

var ErrPolicyNotFound = errors.New("tenant policy not found")

type PolicyRepository struct {
	pool *pgxpool.Pool
}

func NewPolicyRepository(pool *pgxpool.Pool) *PolicyRepository {
	return &PolicyRepository{pool: pool}
}

func (r *PolicyRepository) GetByTenantID(ctx context.Context, tenantID uuid.UUID) (*model.TenantPolicy, error) {
	const q = `SELECT id, tenant_id,
		password_min_length, password_require_upper, password_require_lower,
		password_require_number, password_require_symbol, password_require_mfa,
		allowed_mfa_methods, session_max_age_hours, idle_timeout_minutes,
		ip_allowlist, allowed_email_domains, require_sso,
		max_sessions_per_user, password_history_count, lockout_threshold, lockout_duration_min,
		version, created_at, updated_at
		FROM tenant_policies WHERE tenant_id = $1`

	p := &model.TenantPolicy{}
	err := r.pool.QueryRow(ctx, q, tenantID).Scan(
		&p.ID, &p.TenantID,
		&p.PasswordMinLength, &p.PasswordRequireUpper, &p.PasswordRequireLower,
		&p.PasswordRequireNum, &p.PasswordRequireSym, &p.PasswordRequireMFA,
		&p.AllowedMFAMethods, &p.SessionMaxAgeHours, &p.IdleTimeoutMinutes,
		&p.IPAllowlist, &p.AllowedEmailDomains, &p.RequireSSO,
		&p.MaxSessionsPerUser, &p.PasswordHistoryCount, &p.LockoutThreshold, &p.LockoutDurationMin,
		&p.Version, &p.CreatedAt, &p.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrPolicyNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get tenant policy: %w", err)
	}
	return p, nil
}
