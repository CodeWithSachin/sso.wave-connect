package handler

import (
	"github.com/go-playground/validator/v10"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/rs/zerolog"

	"github.com/wave-connect/sso-platform/apps/identity-service/internal/model"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/service"
)

type TokenHandler struct {
	tokenSvc *service.TokenService
	validate *validator.Validate
	log      zerolog.Logger
}

func NewTokenHandler(
	tokenSvc *service.TokenService,
	validate *validator.Validate,
	log zerolog.Logger,
) *TokenHandler {
	return &TokenHandler{
		tokenSvc: tokenSvc,
		validate: validate,
		log:      log.With().Str("component", "token_handler").Logger(),
	}
}

// Refresh handles POST /oauth2/token with grant_type=refresh_token
func (h *TokenHandler) Refresh(c *fiber.Ctx) error {
	var req model.RefreshRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	if err := h.validate.Struct(req); err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": formatValidationErrors(err)})
	}

	tenantID, ok := c.Locals("tenant_id").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "tenant context required"})
	}

	tokens, err := h.tokenSvc.RotateRefresh(c.Context(), req.RefreshToken, tenantID)
	if err != nil {
		h.log.Warn().Err(err).Msg("refresh token rotation failed")
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid or expired refresh token"})
	}

	return c.JSON(tokens)
}

// Revoke handles POST /oauth2/revoke
func (h *TokenHandler) Revoke(c *fiber.Ctx) error {
	var req model.RevokeRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	if err := h.validate.Struct(req); err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": formatValidationErrors(err)})
	}

	tenantID, ok := c.Locals("tenant_id").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "tenant context required"})
	}

	// Try to decrypt the token to get JTI and expiry
	claims, err := h.tokenSvc.DecryptAccessToken(c.Context(), req.Token, tenantID)
	if err != nil {
		// Even if we can't decrypt, return 200 per RFC 7009 (token may already be invalid)
		return c.SendStatus(fiber.StatusOK)
	}

	if err := h.tokenSvc.RevokeToken(c.Context(), claims.JTI, claims.Expiry); err != nil {
		h.log.Error().Err(err).Msg("failed to revoke token")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
	}

	return c.SendStatus(fiber.StatusOK)
}
