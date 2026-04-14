package handler

import (
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

// HealthHandler handles health check endpoints.
type HealthHandler struct {
	pool *pgxpool.Pool
	rdb  *redis.Client
}

// NewHealthHandler creates a new health handler.
func NewHealthHandler(pool *pgxpool.Pool, rdb *redis.Client) *HealthHandler {
	return &HealthHandler{pool: pool, rdb: rdb}
}

// Liveness returns 200 if the service is running.
func (h *HealthHandler) Liveness(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{"status": "ok"})
}

// Readiness checks database and Redis connectivity.
func (h *HealthHandler) Readiness(c *fiber.Ctx) error {
	ctx := c.Context()

	if err := h.pool.Ping(ctx); err != nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
			"status":   "unavailable",
			"database": "down",
		})
	}

	if err := h.rdb.Ping(ctx).Err(); err != nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
			"status": "unavailable",
			"redis":  "down",
		})
	}

	return c.JSON(fiber.Map{
		"status":   "ready",
		"database": "up",
		"redis":    "up",
	})
}
