package handler

import (
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/rs/zerolog"

	"github.com/wave-connect/sso-platform/apps/sso-service/internal/service"
)

type OIDCHandler struct {
	oidcSvc *service.OIDCService
	issuer  string
	log     zerolog.Logger
}

func NewOIDCHandler(oidcSvc *service.OIDCService, issuer string, log zerolog.Logger) *OIDCHandler {
	return &OIDCHandler{
		oidcSvc: oidcSvc,
		issuer:  issuer,
		log:     log.With().Str("handler", "oidc").Logger(),
	}
}

// Discovery handles GET /.well-known/openid-configuration.
func (h *OIDCHandler) Discovery(c *fiber.Ctx) error {
	doc := service.GetDiscoveryDocument(h.issuer)
	return c.JSON(doc)
}

// UserInfo handles GET /userinfo — returns user claims based on access token scopes.
func (h *OIDCHandler) UserInfo(c *fiber.Ctx) error {
	// Extract token from Authorization header
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

	// We need the tenant_id to decrypt. Try from header or query param.
	tenantIDStr := c.Get("X-Tenant-ID")
	if tenantIDStr == "" {
		tenantIDStr = c.Query("tenant_id")
	}
	if tenantIDStr == "" {
		// Try to get from Locals (set by middleware)
		if tid, ok := c.Locals("tenantID").(string); ok {
			tenantIDStr = tid
		}
	}

	if tenantIDStr == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "tenant_id is required",
		})
	}

	tenantID, err := uuid.Parse(tenantIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid tenant_id",
		})
	}

	token, err := h.oidcSvc.DecryptAccessToken(parts[1], tenantID)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "invalid or expired token",
		})
	}

	sub, err := token.GetSubject()
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "invalid token claims",
		})
	}

	userID, err := uuid.Parse(sub)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "invalid token claims",
		})
	}

	var email string
	_ = token.Get("email", &email)

	var name string
	_ = token.Get("name", &name)

	var scopes []string
	_ = token.Get("scopes", &scopes)

	info := h.oidcSvc.BuildUserInfo(userID, email, name, "", tenantID, scopes)

	return c.JSON(info)
}
