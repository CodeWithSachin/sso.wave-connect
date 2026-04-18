package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrSessionNotFound = errors.New("session not found or expired")

// SessionRepository provides read-only access to the shared sessions table.
// Used by sso-service to validate SSO session cookies set by identity-service.
type SessionRepository struct {
	pool *pgxpool.Pool
}

func NewSessionRepository(pool *pgxpool.Pool) *SessionRepository {
	return &SessionRepository{pool: pool}
}

// ValidateByTokenHash looks up an active, non-expired session by its SHA-256 token hash.
// Returns the user ID and the session's LIVE tenant (active_tenant_id, added in
// Phase 5). sso-service consumes this for its OAuth2 consent + authorize flow;
// the anchor `tenant_id` is kept unused here — the "which tenant is the user
// currently operating under?" question is what every downstream decision needs.
func (r *SessionRepository) ValidateByTokenHash(ctx context.Context, tokenHash string) (uuid.UUID, uuid.UUID, error) {
	const q = `SELECT user_id, active_tenant_id FROM sessions
		WHERE token_hash = $1 AND status = 'active' AND expires_at > NOW()
		LIMIT 1`

	var userID, activeTenantID uuid.UUID
	err := r.pool.QueryRow(ctx, q, tokenHash).Scan(&userID, &activeTenantID)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, uuid.Nil, ErrSessionNotFound
	}
	if err != nil {
		return uuid.Nil, uuid.Nil, fmt.Errorf("validate session by token hash: %w", err)
	}
	return userID, activeTenantID, nil
}
