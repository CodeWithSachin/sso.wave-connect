package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrUserNotFound is returned when a SELECT by id finds no row (or the row
// is soft-deleted). sso-service treats this as an internal consistency
// problem — the OAuth flow only proceeds after identity-service authenticates
// the user, so the user MUST exist by the time we mint a token.
var ErrUserNotFound = errors.New("user not found")

// User is the read-only projection sso-service needs to populate ID-token
// claims. We deliberately do NOT pull password_hash or any auth-sensitive
// columns — the OIDC issuer has no business touching credential material.
type User struct {
	ID          uuid.UUID
	Email       string
	DisplayName string
	AvatarURL   string
}

// UserRepository is sso-service's read-only handle on the shared `users`
// table. Writes to this table are owned by identity-service; sso-service
// only reads to populate ID-token and userinfo claims.
type UserRepository struct {
	pool *pgxpool.Pool
}

func NewUserRepository(pool *pgxpool.Pool) *UserRepository {
	return &UserRepository{pool: pool}
}

// GetByID fetches the claim-relevant projection of a user. Returns
// ErrUserNotFound for missing or soft-deleted rows.
func (r *UserRepository) GetByID(ctx context.Context, id uuid.UUID) (*User, error) {
	const q = `
		SELECT id, email, display_name, COALESCE(avatar_url, '')
		FROM users
		WHERE id = $1 AND deleted_at IS NULL
	`
	u := &User{}
	if err := r.pool.QueryRow(ctx, q, id).Scan(&u.ID, &u.Email, &u.DisplayName, &u.AvatarURL); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, fmt.Errorf("get user by id: %w", err)
	}
	return u, nil
}
