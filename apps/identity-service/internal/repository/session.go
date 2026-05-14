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

// sessionSelectCols mirrors the columns all session reads use, so adding a
// new column only requires one edit here. Phase 5: active_tenant_id.
const sessionSelectCols = `id, user_id, tenant_id, active_tenant_id, token_hash, status,
	ip_address::text, user_agent, last_activity_at, expires_at, revoked_at, created_at`

// scanSession is the matching scan order for sessionSelectCols.
func scanSession(row interface {
	Scan(dest ...any) error
}, s *model.Session) error {
	return row.Scan(
		&s.ID, &s.UserID, &s.TenantID, &s.ActiveTenantID, &s.TokenHash, &s.Status,
		&s.IPAddress, &s.UserAgent, &s.LastActivityAt, &s.ExpiresAt, &s.RevokedAt, &s.CreatedAt,
	)
}

func (r *SessionRepository) Create(ctx context.Context, s *model.Session) error {
	// On creation, active_tenant_id defaults to the anchor tenant_id. Phase 5
	// switches flip it later via SetActiveTenant — new sessions always start
	// in their anchor context.
	if s.ActiveTenantID == uuid.Nil {
		s.ActiveTenantID = s.TenantID
	}
	const q = `INSERT INTO sessions (id, user_id, tenant_id, active_tenant_id, token_hash, status, ip_address, user_agent, last_activity_at, expires_at, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7::inet, $8, $9, $10, $11)`
	_, err := r.pool.Exec(ctx, q,
		s.ID, s.UserID, s.TenantID, s.ActiveTenantID, s.TokenHash, s.Status,
		s.IPAddress, s.UserAgent, s.LastActivityAt, s.ExpiresAt, s.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("insert session: %w", err)
	}
	return nil
}

// ListByUser returns the user's active sessions scoped to the given tenant —
// scoped by `active_tenant_id` (Phase 5) so the session-management UI only
// surfaces sessions that are currently acting on behalf of that tenant.
func (r *SessionRepository) ListByUser(ctx context.Context, userID, tenantID uuid.UUID) ([]model.Session, error) {
	const q = `SELECT ` + sessionSelectCols + `
		FROM sessions WHERE user_id = $1 AND active_tenant_id = $2 AND status = 'active' AND expires_at > NOW()
		ORDER BY created_at DESC`
	rows, err := r.pool.Query(ctx, q, userID, tenantID)
	if err != nil {
		return nil, fmt.Errorf("list sessions: %w", err)
	}
	defer rows.Close()

	var sessions []model.Session
	for rows.Next() {
		var s model.Session
		if err := scanSession(rows, &s); err != nil {
			return nil, fmt.Errorf("scan session: %w", err)
		}
		sessions = append(sessions, s)
	}
	return sessions, rows.Err()
}

func (r *SessionRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.Session, error) {
	const q = `SELECT ` + sessionSelectCols + ` FROM sessions WHERE id = $1`
	s := &model.Session{}
	err := scanSession(r.pool.QueryRow(ctx, q, id), s)
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
	const q = `SELECT ` + sessionSelectCols + `
		FROM sessions WHERE token_hash = $1 AND status = 'active' AND expires_at > NOW() LIMIT 1`
	s := &model.Session{}
	err := scanSession(r.pool.QueryRow(ctx, q, tokenHash), s)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrSessionNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get session by token hash: %w", err)
	}
	return s, nil
}

// SetActiveTenant flips the session's `active_tenant_id`. Scoped by session
// ID + user ID so a stolen session ID from another user can't mutate the
// target's context. Caller must have already validated that the user has a
// membership in targetTenantID (see MembershipService.SwitchActiveTenant).
//
// Returns ErrSessionNotFound when the session doesn't exist, is revoked,
// or belongs to a different user.
func (r *SessionRepository) SetActiveTenant(ctx context.Context, sessionID, userID, targetTenantID uuid.UUID) error {
	const q = `UPDATE sessions
		SET active_tenant_id = $3,
		    last_activity_at = NOW()
		WHERE id = $1 AND user_id = $2 AND status = 'active' AND expires_at > NOW()`
	tag, err := r.pool.Exec(ctx, q, sessionID, userID, targetTenantID)
	if err != nil {
		return fmt.Errorf("set active tenant: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrSessionNotFound
	}
	return nil
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

// RevokeAllByUserTx bulk-revokes every active session for a user inside the
// caller's transaction. Used by the Phase 4 accept/force-move flow: after
// moving a user's membership from personal → org, their existing cookie ties
// them to the stale tenant context and must be killed so the next request
// re-authenticates into the org tenant.
//
// Returns the number of sessions revoked — handlers use this for audit log
// detail ("revoked N sessions during migration").
func (r *SessionRepository) RevokeAllByUserTx(ctx context.Context, tx pgx.Tx, userID uuid.UUID, reason string) (int, error) {
	const q = `UPDATE sessions
		SET status = 'revoked', revoked_at = NOW(), revoke_reason = $2
		WHERE user_id = $1 AND status = 'active'`
	tag, err := tx.Exec(ctx, q, userID, reason)
	if err != nil {
		return 0, fmt.Errorf("revoke all sessions: %w", err)
	}
	return int(tag.RowsAffected()), nil
}
