package service

import (
	"context"
	"fmt"
	"time"

	"github.com/dgraph-io/ristretto/v2"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"
)

// CacheService implements a 2-layer permission cache: L1 (Ristretto in-memory) + L2 (Redis).
type CacheService struct {
	l1    *ristretto.Cache[string, bool]
	l2    *redis.Client
	l1TTL time.Duration
	l2TTL time.Duration
	log   zerolog.Logger
}

// NewCacheService creates a new 2-layer cache.
func NewCacheService(rdb *redis.Client, l1MaxItems int64, l1TTL, l2TTL time.Duration, log zerolog.Logger) (*CacheService, error) {
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
		l1TTL: l1TTL,
		l2TTL: l2TTL,
		log:   log.With().Str("component", "cache").Logger(),
	}, nil
}

// Get retrieves a value from L1, then L2.
func (c *CacheService) Get(ctx context.Context, key string) (bool, bool) {
	// L1 check
	if val, found := c.l1.Get(key); found {
		return val, true
	}

	// L2 check
	result, err := c.l2.Get(ctx, c.redisKey(key)).Result()
	if err == redis.Nil {
		return false, false
	}
	if err != nil {
		c.log.Warn().Err(err).Str("key", key).Msg("redis cache get failed")
		return false, false
	}

	allowed := result == "1"

	// Backfill L1
	c.l1.SetWithTTL(key, allowed, 1, c.l1TTL)

	return allowed, true
}

// Set stores a value in both L1 and L2.
func (c *CacheService) Set(ctx context.Context, key string, allowed bool) {
	// L1
	c.l1.SetWithTTL(key, allowed, 1, c.l1TTL)

	// L2
	val := "0"
	if allowed {
		val = "1"
	}
	if err := c.l2.Set(ctx, c.redisKey(key), val, c.l2TTL).Err(); err != nil {
		c.log.Warn().Err(err).Str("key", key).Msg("redis cache set failed")
	}
}

// Delete removes a value from both L1 and L2.
func (c *CacheService) Delete(ctx context.Context, key string) {
	c.l1.Del(key)
	if err := c.l2.Del(ctx, c.redisKey(key)).Err(); err != nil {
		c.log.Warn().Err(err).Str("key", key).Msg("redis cache delete failed")
	}
}

// Close cleans up resources.
func (c *CacheService) Close() {
	c.l1.Close()
}

func (c *CacheService) redisKey(key string) string {
	return "authz:" + key
}
