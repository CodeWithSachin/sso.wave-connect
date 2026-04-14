package middleware

import (
	"strings"
	"time"

	"aidanwoods.dev/go-paseto"
	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog"
)

// PASETOAuth validates service-to-service PASETO v4.local tokens.
func PASETOAuth(symmetricKeyHex string, log zerolog.Logger) fiber.Handler {
	symKey, err := paseto.V4SymmetricKeyFromHex(symmetricKeyHex)
	if err != nil {
		log.Fatal().Err(err).Msg("invalid PASETO symmetric key hex")
	}

	parser := paseto.NewParser()
	parser.AddRule(paseto.NotExpired())
	parser.AddRule(paseto.IssuedBy("https://sso.wave-connect.com"))

	return func(c *fiber.Ctx) error {
		authHeader := c.Get("Authorization")
		if authHeader == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "missing authorization header",
			})
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "invalid authorization header format",
			})
		}

		token, err := parser.ParseV4Local(symKey, parts[1], nil)
		if err != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "invalid or expired token",
			})
		}

		// Extract claims
		sub, _ := token.GetString("sub")
		tenantID, _ := token.GetString("tid")
		exp, _ := token.GetTime("exp")

		if sub == "" || time.Now().After(exp) {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "invalid token claims",
			})
		}

		c.Locals("userID", sub)
		c.Locals("tenantID", tenantID)

		return c.Next()
	}
}
