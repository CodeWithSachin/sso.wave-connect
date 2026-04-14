package middleware

import (
	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog"
)

func Recovery(log zerolog.Logger) fiber.Handler {
	return func(c *fiber.Ctx) (err error) {
		defer func() {
			if r := recover(); r != nil {
				log.Error().
					Interface("panic", r).
					Str("path", c.Path()).
					Str("method", c.Method()).
					Msg("recovered from panic")
				err = c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
					"error": "internal server error",
				})
			}
		}()
		return c.Next()
	}
}
