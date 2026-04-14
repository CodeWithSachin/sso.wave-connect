package middleware

import (
	"context"
	"fmt"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/redis/go-redis/v9"
)

type RateLimitConfig struct {
	KeyPrefix string
	Max       int
	Window    time.Duration
	KeyFunc   func(c *fiber.Ctx) string
}

// RateLimit implements a Redis sliding-window rate limiter.
func RateLimit(rdb *redis.Client, cfg RateLimitConfig) fiber.Handler {
	return func(c *fiber.Ctx) error {
		key := fmt.Sprintf("rl:%s:%s", cfg.KeyPrefix, cfg.KeyFunc(c))
		ctx := context.Background()
		now := time.Now().UnixMilli()
		windowStart := now - cfg.Window.Milliseconds()

		pipe := rdb.Pipeline()
		// Remove entries outside the window
		pipe.ZRemRangeByScore(ctx, key, "0", fmt.Sprintf("%d", windowStart))
		// Add current request
		pipe.ZAdd(ctx, key, redis.Z{Score: float64(now), Member: fmt.Sprintf("%d", now)})
		// Count entries in window
		countCmd := pipe.ZCard(ctx, key)
		// Set expiry on the key
		pipe.Expire(ctx, key, cfg.Window)

		if _, err := pipe.Exec(ctx); err != nil {
			// If Redis is down, allow the request (fail open)
			return c.Next()
		}

		count := countCmd.Val()
		if count > int64(cfg.Max) {
			return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{
				"error":       "rate limit exceeded",
				"retry_after": cfg.Window.Seconds(),
			})
		}

		return c.Next()
	}
}

// LoginRateLimit: 10 requests per 15 minutes, keyed by email.
func LoginRateLimit(rdb *redis.Client) fiber.Handler {
	return RateLimit(rdb, RateLimitConfig{
		KeyPrefix: "login",
		Max:       10,
		Window:    15 * time.Minute,
		KeyFunc: func(c *fiber.Ctx) string {
			// Parse email from body without consuming it
			type req struct {
				Email string `json:"email"`
			}
			var r req
			_ = c.BodyParser(&r)
			if r.Email != "" {
				return r.Email
			}
			return c.IP()
		},
	})
}

// RegisterRateLimit: 20 requests per hour, keyed by IP.
func RegisterRateLimit(rdb *redis.Client) fiber.Handler {
	return RateLimit(rdb, RateLimitConfig{
		KeyPrefix: "register",
		Max:       20,
		Window:    1 * time.Hour,
		KeyFunc: func(c *fiber.Ctx) string {
			return c.IP()
		},
	})
}
