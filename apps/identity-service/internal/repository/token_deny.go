package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

type TokenDenyRepository struct {
	rdb *redis.Client
}

func NewTokenDenyRepository(rdb *redis.Client) *TokenDenyRepository {
	return &TokenDenyRepository{rdb: rdb}
}

func (r *TokenDenyRepository) Add(ctx context.Context, jti string, expiresAt time.Time) error {
	ttl := time.Until(expiresAt)
	if ttl <= 0 {
		return nil // Already expired, no need to deny-list
	}
	key := fmt.Sprintf("token:deny:%s", jti)
	return r.rdb.Set(ctx, key, "revoked", ttl).Err()
}

func (r *TokenDenyRepository) IsDenied(ctx context.Context, jti string) (bool, error) {
	key := fmt.Sprintf("token:deny:%s", jti)
	val, err := r.rdb.Exists(ctx, key).Result()
	if err != nil {
		return false, fmt.Errorf("check deny list: %w", err)
	}
	return val > 0, nil
}
