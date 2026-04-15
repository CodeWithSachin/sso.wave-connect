package middleware

import (
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
)

func CORS() fiber.Handler {
	return cors.New(cors.Config{
		AllowOrigins:     "http://localhost:4200,http://localhost:4300,http://localhost:4400",
		AllowMethods:     "GET,POST,PUT,DELETE,OPTIONS",
		AllowHeaders:     "Origin,Content-Type,Accept,Authorization,X-Tenant-ID,X-Request-ID",
		ExposeHeaders:    "X-Request-ID",
		AllowCredentials: true,
		MaxAge:           3600,
	})
}
