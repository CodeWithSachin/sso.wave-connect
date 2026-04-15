package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/wave-connect/sso-platform/apps/identity-service/internal/model"
)

const refreshFamilyCachePrefix = "rtf:"
const refreshFamilyCacheTTL = 5 * time.Minute

// CachedRefreshFamilyRepository wraps RefreshFamilyRepository with a Redis read-through cache.
// Writes go directly to the DB and invalidate the cache.
type CachedRefreshFamilyRepository struct {
	inner *RefreshFamilyRepository
	rdb   *redis.Client
}

func NewCachedRefreshFamilyRepository(inner *RefreshFamilyRepository, rdb *redis.Client) *CachedRefreshFamilyRepository {
	return &CachedRefreshFamilyRepository{inner: inner, rdb: rdb}
}

func (r *CachedRefreshFamilyRepository) Create(ctx context.Context, f *model.RefreshTokenFamily) error {
	return r.inner.Create(ctx, f)
}

func (r *CachedRefreshFamilyRepository) GetByID(ctx context.Context, familyID string) (*model.RefreshTokenFamily, error) {
	key := refreshFamilyCachePrefix + familyID

	// Check Redis cache
	cached, err := r.rdb.Get(ctx, key).Bytes()
	if err == nil {
		var f model.RefreshTokenFamily
		if json.Unmarshal(cached, &f) == nil {
			return &f, nil
		}
	}

	// Cache miss — fetch from DB
	f, err := r.inner.GetByID(ctx, familyID)
	if err != nil {
		return nil, err
	}

	// Backfill cache
	if data, err := json.Marshal(f); err == nil {
		r.rdb.Set(ctx, key, data, refreshFamilyCacheTTL)
	}

	return f, nil
}

func (r *CachedRefreshFamilyRepository) Rotate(ctx context.Context, familyID string, expectedGen int, newJTI string) error {
	err := r.inner.Rotate(ctx, familyID, expectedGen, newJTI)
	if err == nil {
		r.invalidate(ctx, familyID)
	}
	return err
}

func (r *CachedRefreshFamilyRepository) Revoke(ctx context.Context, familyID string) error {
	err := r.inner.Revoke(ctx, familyID)
	if err == nil {
		r.invalidate(ctx, familyID)
	}
	return err
}

func (r *CachedRefreshFamilyRepository) invalidate(ctx context.Context, familyID string) {
	key := refreshFamilyCachePrefix + familyID
	r.rdb.Del(ctx, key)
}

func init() {
	_ = fmt.Sprintf
}
