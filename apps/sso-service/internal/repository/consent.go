package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/wave-connect/sso-platform/apps/sso-service/internal/model"
)

var ErrConsentNotFound = errors.New("consent not found")

type ConsentRepository struct {
	pool *pgxpool.Pool
}

func NewConsentRepository(pool *pgxpool.Pool) *ConsentRepository {
	return &ConsentRepository{pool: pool}
}

func (r *ConsentRepository) GetConsent(ctx context.Context, tenantID, userID, clientID uuid.UUID) (*model.UserConsent, error) {
	const q = `SELECT id, user_id, client_id, tenant_id, granted_scopes, status,
		granted_at, revoked_at, expires_at
		FROM user_consents
		WHERE tenant_id = $1 AND user_id = $2 AND client_id = $3 AND status = 'granted'`

	c := &model.UserConsent{}
	err := r.pool.QueryRow(ctx, q, tenantID, userID, clientID).Scan(
		&c.ID, &c.UserID, &c.ClientID, &c.TenantID, &c.GrantedScopes,
		&c.Status, &c.GrantedAt, &c.RevokedAt, &c.ExpiresAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrConsentNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get consent: %w", err)
	}
	return c, nil
}

func (r *ConsentRepository) GrantConsent(ctx context.Context, consent *model.UserConsent) error {
	const q = `INSERT INTO user_consents (id, user_id, client_id, tenant_id, granted_scopes, status, granted_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		ON CONFLICT (tenant_id, user_id, client_id) DO UPDATE SET
			granted_scopes = EXCLUDED.granted_scopes,
			status = 'granted',
			granted_at = EXCLUDED.granted_at,
			revoked_at = NULL`

	if consent.ID == uuid.Nil {
		consent.ID = uuid.New()
	}
	if consent.GrantedAt.IsZero() {
		consent.GrantedAt = time.Now().UTC()
	}
	if consent.Status == "" {
		consent.Status = "granted"
	}

	_, err := r.pool.Exec(ctx, q,
		consent.ID, consent.UserID, consent.ClientID, consent.TenantID,
		consent.GrantedScopes, consent.Status, consent.GrantedAt,
	)
	if err != nil {
		return fmt.Errorf("grant consent: %w", err)
	}
	return nil
}

func (r *ConsentRepository) RevokeConsent(ctx context.Context, tenantID, userID, clientID uuid.UUID) error {
	const q = `UPDATE user_consents SET status = 'revoked', revoked_at = $1
		WHERE tenant_id = $2 AND user_id = $3 AND client_id = $4 AND status = 'granted'`

	tag, err := r.pool.Exec(ctx, q, time.Now().UTC(), tenantID, userID, clientID)
	if err != nil {
		return fmt.Errorf("revoke consent: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrConsentNotFound
	}
	return nil
}
