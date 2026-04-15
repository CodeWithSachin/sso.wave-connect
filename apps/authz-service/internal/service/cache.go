package service

import (
	"context"
	"fmt"
	"time"

	"github.com/dgraph-io/ristretto/v2"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"

	"github.com/wave-connect/sso-platform/apps/authz-service/internal/repository"
)

// CacheService implements a 3-layer permission cache: L1 (Ristretto) + L2 (Redis) + L3 (PostgreSQL).
type CacheService struct {
	l1    *ristretto.Cache[string, bool]
	l2    *redis.Client
	l3    *repository.PermissionCacheRepository // optional
	l1TTL time.Duration
	l2TTL time.Duration
	l3TTL time.Duration
	log   zerolog.Logger
}

// NewCacheService creates a new 3-layer cache. l3Repo can be nil to disable L3.
func NewCacheService(rdb *redis.Client, l3Repo *repository.PermissionCacheRepository, l1MaxItems int64, l1TTL, l2TTL time.Duration, log zerolog.Logger) (*CacheService, error) {
	l1, err := ristretto.NewCache(&ristretto.Config[string, bool]{
		NumCounters: l1MaxItems * 10,
		MaxCost:     l1MaxItems,
		BufferItems: 64,
	})
	if err != nil {
		return nil, fmt.Errorf("create ristretto cache: %w", err)
	}

	return &CacheService{
		l1:    l1,
		l2:    rdb,
		l3:    l3Repo,
		l1TTL: l1TTL,
		l2TTL: l2TTL,
		l3TTL: 15 * time.Minute, // L3 has longer TTL — stale fallback
		log:   log.With().Str("component", "cache").Logger(),
	}, nil
}

// Get retrieves a value from L1, then L2, then L3 (PostgreSQL fallback).
func (c *CacheService) Get(ctx context.Context, key string) (bool, bool) {
	// L1 check (Ristretto in-memory)
	if val, found := c.l1.Get(key); found {
		return val, true
	}

	// L2 check (Redis)
	result, err := c.l2.Get(ctx, c.redisKey(key)).Result()
	if err == nil {
		allowed := result == "1"
		c.l1.SetWithTTL(key, allowed, 1, c.l1TTL) // Backfill L1
		return allowed, true
	}
	if err != redis.Nil {
		c.log.Warn().Err(err).Str("key", key).Msg("redis cache get failed")
	}

	// L3 check (PostgreSQL UNLOGGED — circuit breaker fallback)
	if c.l3 != nil {
		if allowed, found := c.l3.Get(ctx, key); found {
			c.l1.SetWithTTL(key, allowed, 1, c.l1TTL) // Backfill L1
			return allowed, true
		}
	}

	return false, false
}

// Set stores a value in L1, L2, and L3.
func (c *CacheService) Set(ctx context.Context, key string, allowed bool) {
	// L1 (Ristretto)
	c.l1.SetWithTTL(key, allowed, 1, c.l1TTL)

	// L2 (Redis)
	val := "0"
	if allowed {
		val = "1"
	}
	if err := c.l2.Set(ctx, c.redisKey(key), val, c.l2TTL).Err(); err != nil {
		c.log.Warn().Err(err).Str("key", key).Msg("redis cache set failed")
	}

	// L3 (PostgreSQL UNLOGGED — fallback)
	if c.l3 != nil {
		c.l3.Set(ctx, key, allowed, c.l3TTL)
	}
}

// Delete removes a value from both L1 and L2.
func (c *CacheService) Delete(ctx context.Context, key string) {
	c.l1.Del(key)
	if err := c.l2.Del(ctx, c.redisKey(key)).Err(); err != nil {
		c.log.Warn().Err(err).Str("key", key).Msg("redis cache delete failed")
	}
}

// InvalidateForTuple removes all cached permission checks related to a tuple change.
// Called by the NATS subscriber when a tuple is written or deleted on any replica.
func (c *CacheService) InvalidateForTuple(user, relation, object string) {
	// The cache key format in authz.go is "check:<user>:<relation>:<object>"
	key := fmt.Sprintf("check:%s:%s:%s", user, relation, object)
	c.l1.Del(key)
	// Also delete from L2 (best effort)
	c.l2.Del(context.Background(), c.redisKey(key))
}

// Close cleans up resources.
func (c *CacheService) Close() {
	c.l1.Close()
}

func (c *CacheService) redisKey(key string) string {
	return "authz:" + key
}
