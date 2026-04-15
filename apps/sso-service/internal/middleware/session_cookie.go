package middleware

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"strings"

	"aidanwoods.dev/go-paseto"
	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog"

	"github.com/wave-connect/sso-platform/apps/sso-service/internal/repository"
)

// SessionOrTokenAuth is a combined middleware for the OAuth2 authorize endpoint.
// It checks two sources of identity in order:
//  1. Authorization: Bearer <PASETO> header (existing flow)
//  2. sso_session cookie (new SSO flow — set by identity-service on login)
//
// If either succeeds, sets "userID" and "tenantID" in Fiber locals.
// If neither is found, passes through — the handler will redirect to login.
func SessionOrTokenAuth(symmetricKeyHex string, sessionRepo *repository.SessionRepository, log zerolog.Logger) fiber.Handler {
	symKey, err := paseto.V4SymmetricKeyFromHex(symmetricKeyHex)
	if err != nil {
		log.Fatal().Err(err).Msg("invalid PASETO symmetric key hex")
	}

	parser := paseto.NewParser()
	parser.AddRule(paseto.NotExpired())
	parser.AddRule(paseto.IssuedBy("https://sso.wave-connect.com"))

	return func(c *fiber.Ctx) error {
		// 1. Try PASETO Bearer token first
		authHeader := c.Get("Authorization")
		if authHeader != "" {
			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) == 2 && strings.EqualFold(parts[0], "Bearer") {
				token, err := parser.ParseV4Local(symKey, parts[1], nil)
				if err == nil {
					sub, _ := token.GetString("sub")
					tenantID, _ := token.GetString("tid")
					if sub != "" {
						c.Locals("userID", sub)
						c.Locals("tenantID", tenantID)
						return c.Next()
					}
				}
			}
		}

		// 2. Try SSO session cookie
		cookieValue := c.Cookies("sso_session")
		if cookieValue != "" {
			tokenHash, err := hashCookieToken(cookieValue)
			if err == nil {
				userID, tenantID, err := sessionRepo.ValidateByTokenHash(c.Context(), tokenHash)
				if err == nil {
					c.Locals("userID", userID.String())
					c.Locals("tenantID", tenantID.String())
					log.Debug().
						Str("user_id", userID.String()).
						Msg("authenticated via sso_session cookie")
					return c.Next()
				}
			}
			log.Debug().Msg("sso_session cookie present but invalid")
		}

		// 3. Neither found — pass through, handler will redirect to login
		return c.Next()
	}
}

// hashCookieToken decodes the base64url raw token and returns the SHA-256 hex hash.
func hashCookieToken(rawToken string) (string, error) {
	b, err := base64.RawURLEncoding.DecodeString(rawToken)
	if err != nil {
		return "", err
	}
	h := sha256.Sum256(b)
	return hex.EncodeToString(h[:]), nil
}
