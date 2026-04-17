package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PermissionCacheRepository manages the L3 UNLOGGED permission_cache table.
// This is a circuit-breaker fallback: if Redis (L2) is down and Ristretto (L1) expired,
// this table provides stale-but-better-than-deny permission checks.
type PermissionCacheRepository struct {
	pool *pgxpool.Pool
}

func NewPermissionCacheRepository(pool *pgxpool.Pool) *PermissionCacheRepository {
	return &PermissionCacheRepository{pool: pool}
}

// Get retrieves a cached permission check result. Returns (allowed, found).
func (r *PermissionCacheRepository) Get(ctx context.Context, cacheKey string) (bool, bool) {
	const q = `SELECT allowed FROM permission_cache WHERE cache_key = $1 AND expires_at > NOW()`
	var allowed bool
	err := r.pool.QueryRow(ctx, q, cacheKey).Scan(&allowed)
	if err != nil {
		return false, false
	}
	return allowed, true
}

// Set stores a permission check result with an expiry time.
func (r *PermissionCacheRepository) Set(ctx context.Context, cacheKey string, allowed bool, ttl time.Duration) {
	const q = `INSERT INTO permission_cache (cache_key, allowed, expires_at)
		VALUES ($1, $2, $3)
		ON CONFLICT (cache_key) DO UPDATE SET allowed = $2, expires_at = $3`
	expiresAt := time.Now().Add(ttl)
	_, err := r.pool.Exec(ctx, q, cacheKey, allowed, expiresAt)
	if err != nil {
		// Best effort — don't fail the request
		_ = err
	}
}

// Delete removes a specific cache entry.
func (r *PermissionCacheRepository) Delete(ctx context.Context, cacheKey string) {
	const q = `DELETE FROM permission_cache WHERE cache_key = $1`
	r.pool.Exec(ctx, q, cacheKey)
}

// CleanExpired removes expired entries. Run periodically (every 5 min).
func (r *PermissionCacheRepository) CleanExpired(ctx context.Context) (int64, error) {
	const q = `DELETE FROM permission_cache WHERE expires_at < NOW()`
	tag, err := r.pool.Exec(ctx, q)
	if err != nil {
		return 0, fmt.Errorf("clean expired permission cache: %w", err)
	}
	return tag.RowsAffected(), nil
}

// Ensure the table exists (permission_cache from migration 000012)
var _ = pgx.ErrNoRows
