package handler

import (
	"context"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

type HealthHandler struct {
	pool *pgxpool.Pool
	rdb  *redis.Client
}

func NewHealthHandler(pool *pgxpool.Pool, rdb *redis.Client) *HealthHandler {
	return &HealthHandler{pool: pool, rdb: rdb}
}

// Liveness always returns 200
func (h *HealthHandler) Liveness(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{"status": "ok"})
}

// Readiness checks DB and Redis connectivity
func (h *HealthHandler) Readiness(c *fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(c.Context(), 3*time.Second)
	defer cancel()

	checks := fiber.Map{}
	healthy := true

	// Check PostgreSQL
	if err := h.pool.Ping(ctx); err != nil {
		checks["postgres"] = "unhealthy"
		healthy = false
	} else {
		checks["postgres"] = "healthy"
	}

	// Check Redis
	if err := h.rdb.Ping(ctx).Err(); err != nil {
		checks["redis"] = "unhealthy"
		healthy = false
	} else {
		checks["redis"] = "healthy"
	}

	status := fiber.StatusOK
	if !healthy {
		status = fiber.StatusServiceUnavailable
	}

	return c.Status(status).JSON(fiber.Map{
		"status": map[bool]string{true: "ready", false: "not_ready"}[healthy],
		"checks": checks,
	})
}
