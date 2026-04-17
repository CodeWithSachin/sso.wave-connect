package ratelimit

import (
	"fmt"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/redis/go-redis/v9"
)

// KeyFunc extracts the rate limit key from a Fiber context.
type KeyFunc func(c *fiber.Ctx) string

// MiddlewareConfig configures the rate limit middleware.
type MiddlewareConfig struct {
	Limiter   *Limiter
	KeyFunc   KeyFunc
	Limit     int
	Window    time.Duration
	KeyPrefix string
	FailOpen  bool // If true, allow requests when Redis is down
}

// Middleware creates a Fiber middleware that enforces rate limits.
// Sets standard rate limit response headers:
//   - X-RateLimit-Limit: maximum requests in the window
//   - X-RateLimit-Remaining: requests left in the current window
//   - X-RateLimit-Reset: Unix timestamp when the window resets
//   - Retry-After: seconds until the client can retry (only on 429)
func Middleware(cfg MiddlewareConfig) fiber.Handler {
	return func(c *fiber.Ctx) error {
		key := fmt.Sprintf("rl:%s:%s", cfg.KeyPrefix, cfg.KeyFunc(c))

		result, err := cfg.Limiter.Check(c.Context(), key, cfg.Limit, cfg.Window)
		if err != nil {
			if cfg.FailOpen {
				// Allow request through if Redis is down
				return c.Next()
			}
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "rate limit check failed",
			})
		}

		// Set rate limit headers on every response
		c.Set("X-RateLimit-Limit", strconv.Itoa(result.Limit))
		c.Set("X-RateLimit-Remaining", strconv.Itoa(result.Remaining))
		c.Set("X-RateLimit-Reset", strconv.FormatInt(result.ResetAt.Unix(), 10))

		if !result.Allowed {
			retryAfter := int(time.Until(result.ResetAt).Seconds()) + 1
			c.Set("Retry-After", strconv.Itoa(retryAfter))
			return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{
				"error":       "rate_limit_exceeded",
				"retry_after": retryAfter,
			})
		}

		return c.Next()
	}
}

// ByIP returns a KeyFunc that uses the client IP address.
func ByIP() KeyFunc {
	return func(c *fiber.Ctx) string { return c.IP() }
}

// ByTenantID returns a KeyFunc that uses the tenant ID from Fiber locals.
func ByTenantID() KeyFunc {
	return func(c *fiber.Ctx) string {
		if tid, ok := c.Locals("tenant_id").(fmt.Stringer); ok {
			return tid.String()
		}
		return "unknown"
	}
}

// ByUserID returns a KeyFunc that uses the user ID from Fiber locals.
func ByUserID() KeyFunc {
	return func(c *fiber.Ctx) string {
		if uid, ok := c.Locals("user_id").(fmt.Stringer); ok {
			return uid.String()
		}
		return "anonymous"
	}
}

// TenantTierMiddleware creates a Fiber middleware with per-tenant plan-based limits.
// Reads the tenant plan from the "tenant_plan" Fiber local (set by tenant extraction middleware).
func TenantTierMiddleware(rdb *redis.Client, keyPrefix string) fiber.Handler {
	limiter := NewLimiter(rdb)

	return func(c *fiber.Ctx) error {
		plan, _ := c.Locals("tenant_plan").(string)
		tier := TierForPlan(plan)

		key := fmt.Sprintf("rl:%s:tenant:%s", keyPrefix, ByTenantID()(c))

		result, err := limiter.Check(c.Context(), key, tier.Limit, tier.Window)
		if err != nil {
			// Fail open
			return c.Next()
		}

		c.Set("X-RateLimit-Limit", strconv.Itoa(result.Limit))
		c.Set("X-RateLimit-Remaining", strconv.Itoa(result.Remaining))
		c.Set("X-RateLimit-Reset", strconv.FormatInt(result.ResetAt.Unix(), 10))

		if !result.Allowed {
			retryAfter := int(time.Until(result.ResetAt).Seconds()) + 1
			c.Set("Retry-After", strconv.Itoa(retryAfter))
			return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{
				"error":       "rate_limit_exceeded",
				"message":     fmt.Sprintf("tenant plan '%s' rate limit exceeded", plan),
				"retry_after": retryAfter,
			})
		}

		return c.Next()
	}
}
