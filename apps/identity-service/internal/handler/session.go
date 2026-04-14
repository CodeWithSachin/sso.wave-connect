package handler

import (
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/rs/zerolog"

	"github.com/wave-connect/sso-platform/apps/identity-service/internal/id"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/model"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/service"
)

type SessionHandler struct {
	sessionSvc *service.SessionService
	log        zerolog.Logger
}

func NewSessionHandler(sessionSvc *service.SessionService, log zerolog.Logger) *SessionHandler {
	return &SessionHandler{
		sessionSvc: sessionSvc,
		log:        log.With().Str("component", "session_handler").Logger(),
	}
}

func (h *SessionHandler) List(c *fiber.Ctx) error {
	userID, ok := c.Locals("user_id").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not authenticated"})
	}
	tenantID, _ := c.Locals("tenant_id").(uuid.UUID)

	sessions, err := h.sessionSvc.ListForUser(c.Context(), userID, tenantID)
	if err != nil {
		h.log.Error().Err(err).Msg("failed to list sessions")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
	}

	dtos := make([]model.SessionDTO, len(sessions))
	for i, s := range sessions {
		dtos[i] = model.SessionDTO{
			ID:             id.Format(id.PrefixSession, s.ID),
			IPAddress:      s.IPAddress,
			UserAgent:      s.UserAgent,
			LastActivityAt: s.LastActivityAt,
			CreatedAt:      s.CreatedAt,
			ExpiresAt:      s.ExpiresAt,
			RevokedAt:      s.RevokedAt,
		}
	}

	return c.JSON(fiber.Map{"sessions": dtos})
}

func (h *SessionHandler) Revoke(c *fiber.Ctx) error {
	userID, ok := c.Locals("user_id").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not authenticated"})
	}
	tenantID, _ := c.Locals("tenant_id").(uuid.UUID)

	sessionIDStr := c.Params("id")
	sessionUUID, _, err := id.Parse(sessionIDStr)
	if err != nil {
		// Try parsing as raw UUID
		sessionUUID, err = uuid.Parse(sessionIDStr)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid session ID"})
		}
	}

	if err := h.sessionSvc.Revoke(c.Context(), sessionUUID, userID, tenantID); err != nil {
		h.log.Warn().Err(err).Str("session_id", sessionIDStr).Msg("failed to revoke session")
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "session not found"})
	}

	return c.SendStatus(fiber.StatusNoContent)
}
