package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/wave-connect/sso-platform/apps/identity-service/internal/model"
)

var ErrFamilyNotFound = errors.New("refresh token family not found")
var ErrFamilyRevoked = errors.New("refresh token family revoked")
var ErrGenerationMismatch = errors.New("refresh token generation mismatch (possible replay)")

type RefreshFamilyRepository struct {
	pool *pgxpool.Pool
}

func NewRefreshFamilyRepository(pool *pgxpool.Pool) *RefreshFamilyRepository {
	return &RefreshFamilyRepository{pool: pool}
}

func (r *RefreshFamilyRepository) Create(ctx context.Context, f *model.RefreshTokenFamily) error {
	const q = `INSERT INTO refresh_token_families (family_id, user_id, tenant_id, client_id, session_id, current_jti, generation, is_revoked, created_at, last_rotated_at, expires_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`
	_, err := r.pool.Exec(ctx, q,
		f.FamilyID, f.UserID, f.TenantID, f.ClientID, f.SessionID,
		f.CurrentJTI, f.Generation, f.IsRevoked,
		f.CreatedAt, f.LastRotatedAt, f.ExpiresAt,
	)
	if err != nil {
		return fmt.Errorf("insert refresh family: %w", err)
	}
	return nil
}

// RevokeBySession revokes every non-revoked family that was minted for the
// given session. Used by the Phase 5 rotate path so switching tenants tears
// down the old family without affecting the user's other sessions (phone,
// second laptop, etc.).
//
// Returns (rowsRevoked, err).
func (r *RefreshFamilyRepository) RevokeBySession(ctx context.Context, sessionID fmt.Stringer, reason string) (int, error) {
	const q = `UPDATE refresh_token_families
		SET is_revoked = TRUE, revoked_reason = $2, last_rotated_at = NOW()
		WHERE session_id = $1 AND is_revoked = FALSE`
	tag, err := r.pool.Exec(ctx, q, sessionID.String(), reason)
	if err != nil {
		return 0, fmt.Errorf("revoke families by session: %w", err)
	}
	return int(tag.RowsAffected()), nil
}

func (r *RefreshFamilyRepository) GetByID(ctx context.Context, familyID string) (*model.RefreshTokenFamily, error) {
	const q = `SELECT family_id, user_id, tenant_id, client_id, current_jti, generation, is_revoked, revoked_reason, created_at, last_rotated_at, expires_at
		FROM refresh_token_families WHERE family_id = $1`
	f := &model.RefreshTokenFamily{}
	var revokedReason *string
	err := r.pool.QueryRow(ctx, q, familyID).Scan(
		&f.FamilyID, &f.UserID, &f.TenantID, &f.ClientID, &f.CurrentJTI, &f.Generation,
		&f.IsRevoked, &revokedReason, &f.CreatedAt, &f.LastRotatedAt, &f.ExpiresAt,
	)
	if revokedReason != nil {
		f.RevokedReason = *revokedReason
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrFamilyNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get refresh family: %w", err)
	}
	return f, nil
}

// Rotate atomically bumps generation and sets new JTI. Returns ErrFamilyRevoked if already
// revoked, ErrGenerationMismatch if the presented generation is stale (replay detection).
func (r *RefreshFamilyRepository) Rotate(ctx context.Context, familyID string, expectedGen int, newJTI string) error {
	const q = `UPDATE refresh_token_families
		SET current_jti = $3, generation = generation + 1, last_rotated_at = $4
		WHERE family_id = $1 AND generation = $2 AND is_revoked = false AND expires_at > NOW()`
	now := time.Now().UTC()
	tag, err := r.pool.Exec(ctx, q, familyID, expectedGen, newJTI, now)
	if err != nil {
		return fmt.Errorf("rotate refresh family: %w", err)
	}
	if tag.RowsAffected() == 0 {
		fam, getErr := r.GetByID(ctx, familyID)
		if getErr != nil {
			return ErrFamilyNotFound
		}
		if fam.IsRevoked {
			return ErrFamilyRevoked
		}
		if fam.Generation != expectedGen {
			return ErrGenerationMismatch
		}
		return ErrFamilyNotFound
	}
	return nil
}

func (r *RefreshFamilyRepository) Revoke(ctx context.Context, familyID string) error {
	const q = `UPDATE refresh_token_families SET is_revoked = true, last_rotated_at = $2 WHERE family_id = $1`
	_, err := r.pool.Exec(ctx, q, familyID, time.Now().UTC())
	if err != nil {
		return fmt.Errorf("revoke refresh family: %w", err)
	}
	return nil
}
