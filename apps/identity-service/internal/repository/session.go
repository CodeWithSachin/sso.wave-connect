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

var ErrSessionNotFound = errors.New("session not found")

type SessionRepository struct {
	pool *pgxpool.Pool
}

func NewSessionRepository(pool *pgxpool.Pool) *SessionRepository {
	return &SessionRepository{pool: pool}
}

func (r *SessionRepository) Create(ctx context.Context, s *model.Session) error {
	const q = `INSERT INTO sessions (id, user_id, tenant_id, token_hash, status, ip_address, user_agent, last_activity_at, expires_at, created_at)
		VALUES ($1, $2, $3, $4, $5, $6::inet, $7, $8, $9, $10)`
	_, err := r.pool.Exec(ctx, q,
		s.ID, s.UserID, s.TenantID, s.TokenHash, s.Status,
		s.IPAddress, s.UserAgent, s.LastActivityAt, s.ExpiresAt, s.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("insert session: %w", err)
	}
	return nil
}

func (r *SessionRepository) ListByUser(ctx context.Context, userID, tenantID uuid.UUID) ([]model.Session, error) {
	const q = `SELECT id, user_id, tenant_id, token_hash, status, ip_address::text, user_agent, last_activity_at, expires_at, revoked_at, created_at
		FROM sessions WHERE user_id = $1 AND tenant_id = $2 AND status = 'active' AND expires_at > NOW()
		ORDER BY created_at DESC`
	rows, err := r.pool.Query(ctx, q, userID, tenantID)
	if err != nil {
		return nil, fmt.Errorf("list sessions: %w", err)
	}
	defer rows.Close()

	var sessions []model.Session
	for rows.Next() {
		var s model.Session
		if err := rows.Scan(
			&s.ID, &s.UserID, &s.TenantID, &s.TokenHash, &s.Status,
			&s.IPAddress, &s.UserAgent, &s.LastActivityAt, &s.ExpiresAt, &s.RevokedAt, &s.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan session: %w", err)
		}
		sessions = append(sessions, s)
	}
	return sessions, rows.Err()
}

func (r *SessionRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.Session, error) {
	const q = `SELECT id, user_id, tenant_id, token_hash, status, ip_address::text, user_agent, last_activity_at, expires_at, revoked_at, created_at
		FROM sessions WHERE id = $1`
	s := &model.Session{}
	err := r.pool.QueryRow(ctx, q, id).Scan(
		&s.ID, &s.UserID, &s.TenantID, &s.TokenHash, &s.Status,
		&s.IPAddress, &s.UserAgent, &s.LastActivityAt, &s.ExpiresAt, &s.RevokedAt, &s.CreatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrSessionNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get session: %w", err)
	}
	return s, nil
}

// GetByTokenHash returns an active, non-expired session matching the given SHA-256 hex hash
// of the raw cookie token. Used by the /auth/logout endpoint to revoke the current session
// without requiring the user to know their session ID.
func (r *SessionRepository) GetByTokenHash(ctx context.Context, tokenHash string) (*model.Session, error) {
	const q = `SELECT id, user_id, tenant_id, token_hash, status, ip_address::text, user_agent, last_activity_at, expires_at, revoked_at, created_at
		FROM sessions WHERE token_hash = $1 AND status = 'active' AND expires_at > NOW() LIMIT 1`
	s := &model.Session{}
	err := r.pool.QueryRow(ctx, q, tokenHash).Scan(
		&s.ID, &s.UserID, &s.TenantID, &s.TokenHash, &s.Status,
		&s.IPAddress, &s.UserAgent, &s.LastActivityAt, &s.ExpiresAt, &s.RevokedAt, &s.CreatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrSessionNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get session by token hash: %w", err)
	}
	return s, nil
}

func (r *SessionRepository) Revoke(ctx context.Context, id uuid.UUID, reason string) error {
	now := time.Now().UTC()
	const q = `UPDATE sessions SET status = 'revoked', revoked_at = $2, revoke_reason = $3 WHERE id = $1 AND status = 'active'`
	tag, err := r.pool.Exec(ctx, q, id, now, reason)
	if err != nil {
		return fmt.Errorf("revoke session: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrSessionNotFound
	}
	return nil
}
