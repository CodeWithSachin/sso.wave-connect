package repository

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrVerificationTokenNotFound — token doesn't exist, is already consumed,
// or is expired. Callers should translate this to a generic "invalid or
// expired link" UI message (no enumeration leakage).
var ErrVerificationTokenNotFound = errors.New("verification token not found or invalid")

// EmailVerificationToken models one row in `email_verification_tokens`.
// TokenHash is the SHA-256 hex digest of the raw token — raw never persists.
type EmailVerificationToken struct {
	TokenHash  string
	UserID     uuid.UUID
	Email      string
	ExpiresAt  time.Time
	ConsumedAt *time.Time
	CreatedAt  time.Time
}

// EmailVerificationRepository owns the email_verification_tokens table.
// Raw tokens are generated + returned once here; thereafter the repo deals
// only in hashes.
type EmailVerificationRepository struct {
	pool *pgxpool.Pool
}

// NewEmailVerificationRepository wraps a pgxpool.
func NewEmailVerificationRepository(pool *pgxpool.Pool) *EmailVerificationRepository {
	return &EmailVerificationRepository{pool: pool}
}

// GenerateToken produces a cryptographically random 32-byte token, returns
// (rawBase64url, sha256hex). The raw value must ONLY appear in the email
// sent to the user; the caller hands the hash to Create() for DB storage.
//
// Same crypto shape as model.GenerateSessionToken — kept separate so a future
// change to one doesn't silently drift the other.
func GenerateToken() (raw string, hash string, err error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", "", fmt.Errorf("rand: %w", err)
	}
	raw = base64.RawURLEncoding.EncodeToString(b)
	h := sha256.Sum256(b)
	hash = hex.EncodeToString(h[:])
	return raw, hash, nil
}

// HashRawToken takes a raw token (as it arrives in the verify-email URL) and
// returns the SHA-256 hex used for DB lookup. Used by VerifyAndConsume().
func HashRawToken(raw string) (string, error) {
	b, err := base64.RawURLEncoding.DecodeString(raw)
	if err != nil {
		return "", fmt.Errorf("decode token: %w", err)
	}
	h := sha256.Sum256(b)
	return hex.EncodeToString(h[:]), nil
}

// Create inserts a new verification token row. Passes through any RLS-safe
// transaction by accepting pgx.Tx in a separate method below.
func (r *EmailVerificationRepository) Create(ctx context.Context, t *EmailVerificationToken) error {
	const q = `INSERT INTO email_verification_tokens (token_hash, user_id, email, expires_at, created_at)
		VALUES ($1, $2, $3, $4, $5)`
	if _, err := r.pool.Exec(ctx, q, t.TokenHash, t.UserID, t.Email, t.ExpiresAt, t.CreatedAt); err != nil {
		return fmt.Errorf("insert verification token: %w", err)
	}
	return nil
}

// CreateTx is the transactional variant — used by SignupService which bundles
// the insert with user/tenant/membership rows. The pool-level Create is kept
// for post-commit flows (resend).
func (r *EmailVerificationRepository) CreateTx(ctx context.Context, tx pgx.Tx, t *EmailVerificationToken) error {
	const q = `INSERT INTO email_verification_tokens (token_hash, user_id, email, expires_at, created_at)
		VALUES ($1, $2, $3, $4, $5)`
	if _, err := tx.Exec(ctx, q, t.TokenHash, t.UserID, t.Email, t.ExpiresAt, t.CreatedAt); err != nil {
		return fmt.Errorf("insert verification token (tx): %w", err)
	}
	return nil
}

// FindActiveByUser returns the most recent un-consumed, un-expired token row
// for a user, if any. Used by the resend flow to avoid blasting duplicates
// (we invalidate the old one before issuing a new one).
func (r *EmailVerificationRepository) FindActiveByUser(ctx context.Context, userID uuid.UUID) (*EmailVerificationToken, error) {
	const q = `SELECT token_hash, user_id, email, expires_at, consumed_at, created_at
		FROM email_verification_tokens
		WHERE user_id = $1 AND consumed_at IS NULL AND expires_at > NOW()
		ORDER BY created_at DESC
		LIMIT 1`
	t := &EmailVerificationToken{}
	err := r.pool.QueryRow(ctx, q, userID).Scan(
		&t.TokenHash, &t.UserID, &t.Email, &t.ExpiresAt, &t.ConsumedAt, &t.CreatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrVerificationTokenNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("find active verification token: %w", err)
	}
	return t, nil
}

// InvalidatePendingByUser marks all un-consumed tokens for a user as consumed
// (without fulfilling the verification). Called before issuing a replacement
// token on resend — prevents the user from holding two live links at once.
func (r *EmailVerificationRepository) InvalidatePendingByUser(ctx context.Context, userID uuid.UUID) error {
	const q = `UPDATE email_verification_tokens
		SET consumed_at = NOW()
		WHERE user_id = $1 AND consumed_at IS NULL`
	if _, err := r.pool.Exec(ctx, q, userID); err != nil {
		return fmt.Errorf("invalidate pending verification tokens: %w", err)
	}
	return nil
}

// ConsumeByHash atomically marks a token as consumed if it's still valid.
// Returns the row (pre-update) on success or ErrVerificationTokenNotFound if
// the token is missing, expired, or already consumed. Using UPDATE ... RETURNING
// keeps this race-free even under concurrent clicks of the same link.
func (r *EmailVerificationRepository) ConsumeByHash(ctx context.Context, tokenHash string) (*EmailVerificationToken, error) {
	const q = `UPDATE email_verification_tokens
		SET consumed_at = NOW()
		WHERE token_hash = $1
		  AND consumed_at IS NULL
		  AND expires_at > NOW()
		RETURNING token_hash, user_id, email, expires_at, consumed_at, created_at`
	t := &EmailVerificationToken{}
	err := r.pool.QueryRow(ctx, q, tokenHash).Scan(
		&t.TokenHash, &t.UserID, &t.Email, &t.ExpiresAt, &t.ConsumedAt, &t.CreatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrVerificationTokenNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("consume verification token: %w", err)
	}
	return t, nil
}
