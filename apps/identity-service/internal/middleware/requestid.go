package middleware

import (
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

const HeaderRequestID = "X-Request-ID"

func RequestID() fiber.Handler {
	return func(c *fiber.Ctx) error {
		rid := c.Get(HeaderRequestID)
		if rid == "" {
			rid = uuid.Must(uuid.NewV7()).String()
		}
		c.Set(HeaderRequestID, rid)
		c.Locals("request_id", rid)
		return c.Next()
	}
}
