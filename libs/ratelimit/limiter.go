package ratelimit

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

// Result holds the outcome of a rate limit check.
type Result struct {
	Allowed   bool
	Remaining int
	ResetAt   time.Time
	Limit     int
}

// Limiter implements a sliding-window rate limiter using Redis sorted sets.
type Limiter struct {
	rdb *redis.Client
}

// NewLimiter creates a new rate limiter backed by Redis.
func NewLimiter(rdb *redis.Client) *Limiter {
	return &Limiter{rdb: rdb}
}

// Check evaluates whether the request identified by key is within the rate limit.
// Uses a sliding window algorithm: ZREMRANGEBYSCORE + ZADD + ZCARD + EXPIRE.
func (l *Limiter) Check(ctx context.Context, key string, limit int, window time.Duration) (*Result, error) {
	now := time.Now()
	windowStart := now.Add(-window)

	pipe := l.rdb.Pipeline()

	// Remove entries outside the window
	pipe.ZRemRangeByScore(ctx, key, "0", fmt.Sprintf("%d", windowStart.UnixMilli()))

	// Add current request
	pipe.ZAdd(ctx, key, redis.Z{Score: float64(now.UnixMilli()), Member: fmt.Sprintf("%d", now.UnixNano())})

	// Count entries in the window
	countCmd := pipe.ZCard(ctx, key)

	// Set expiry on the key
	pipe.Expire(ctx, key, window+time.Second)

	_, err := pipe.Exec(ctx)
	if err != nil {
		return nil, fmt.Errorf("ratelimit pipeline: %w", err)
	}

	count := int(countCmd.Val())
	allowed := count <= limit
	remaining := limit - count
	if remaining < 0 {
		remaining = 0
	}

	return &Result{
		Allowed:   allowed,
		Remaining: remaining,
		ResetAt:   now.Add(window),
		Limit:     limit,
	}, nil
}
