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

// SignupRateLimit: 10 tenantless consumer signups per hour, keyed by IP.
// Tighter than RegisterRateLimit because /auth/public/signup has no tenant
// context — abusers can't be scoped by tenant. See Phase 1 plan.
func SignupRateLimit(rdb *redis.Client) fiber.Handler {
	return RateLimit(rdb, RateLimitConfig{
		KeyPrefix: "signup",
		Max:       10,
		Window:    1 * time.Hour,
		KeyFunc: func(c *fiber.Ctx) string {
			return c.IP()
		},
	})
}

// VerifyEmailRateLimit: 20 verification attempts per 15 min, keyed by IP.
// Protects the token-submission endpoint against brute-force guessing of the
// 32-byte token (already unguessable, but rate-limiting is defense in depth).
func VerifyEmailRateLimit(rdb *redis.Client) fiber.Handler {
	return RateLimit(rdb, RateLimitConfig{
		KeyPrefix: "verify_email",
		Max:       20,
		Window:    15 * time.Minute,
		KeyFunc: func(c *fiber.Ctx) string {
			return c.IP()
		},
	})
}

// ResendVerificationRateLimit: 5 resend requests per hour, keyed by email.
// Falls back to IP when body parse fails. Matches the enumeration-resistant
// 202-on-both-paths response pattern in the resend handler.
func ResendVerificationRateLimit(rdb *redis.Client) fiber.Handler {
	return RateLimit(rdb, RateLimitConfig{
		KeyPrefix: "resend_verify",
		Max:       5,
		Window:    1 * time.Hour,
		KeyFunc: func(c *fiber.Ctx) string {
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

// DiscoverRateLimit: 60 discover lookups per minute per IP. Hot public path
// (hit on every email-step submission in the login UI), so per-minute window
// matches the cache TTL granularity and still blocks abuse. Phase 3.
func DiscoverRateLimit(rdb *redis.Client) fiber.Handler {
	return RateLimit(rdb, RateLimitConfig{
		KeyPrefix: "discover",
		Max:       60,
		Window:    1 * time.Minute,
		KeyFunc: func(c *fiber.Ctx) string {
			return c.IP()
		},
	})
}

// DomainVerifyRateLimit: 60 on-demand verify calls per tenant per hour.
// Phase 2 review fix #3 — prevents a compromised or buggy admin session from
// saturating the DNS resolver pool. Keyed by tenant (read from session
// locals populated upstream by SessionCookieAuth); falls back to IP for
// pre-auth paths that shouldn't hit this limiter anyway.
func DomainVerifyRateLimit(rdb *redis.Client) fiber.Handler {
	return RateLimit(rdb, RateLimitConfig{
		KeyPrefix: "domain_verify",
		Max:       60,
		Window:    1 * time.Hour,
		KeyFunc: func(c *fiber.Ctx) string {
			if tid := c.Locals("tenant_id"); tid != nil {
				return fmt.Sprintf("%v", tid)
			}
			return c.IP()
		},
	})
}
