package handler

import (
	"github.com/go-playground/validator/v10"
	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog"

	"github.com/wave-connect/sso-platform/apps/authz-service/internal/model"
	"github.com/wave-connect/sso-platform/apps/authz-service/internal/service"
)

// AuthzHandler handles permission check endpoints.
type AuthzHandler struct {
	authz    *service.AuthzService
	validate *validator.Validate
	log      zerolog.Logger
}

// NewAuthzHandler creates a new authz handler.
func NewAuthzHandler(authz *service.AuthzService, validate *validator.Validate, log zerolog.Logger) *AuthzHandler {
	return &AuthzHandler{
		authz:    authz,
		validate: validate,
		log:      log.With().Str("component", "authz-handler").Logger(),
	}
}

// Check performs a single permission check.
// POST /authz/check
func (h *AuthzHandler) Check(c *fiber.Ctx) error {
	var req model.CheckRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid request body",
		})
	}
	if err := h.validate.Struct(req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	allowed, err := h.authz.Check(c.Context(), req)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "permission check failed",
		})
	}

	return c.JSON(model.CheckResponse{Allowed: allowed})
}

// BatchCheck performs multiple permission checks.
// POST /authz/batch-check
func (h *AuthzHandler) BatchCheck(c *fiber.Ctx) error {
	var req model.BatchCheckRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid request body",
		})
	}
	if err := h.validate.Struct(req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	results, err := h.authz.BatchCheck(c.Context(), req.Checks)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "batch check failed",
		})
	}

	resp := model.BatchCheckResponse{
		Results: make([]model.CheckResponse, len(results)),
	}
	for i, allowed := range results {
		resp.Results[i] = model.CheckResponse{Allowed: allowed}
	}

	return c.JSON(resp)
}

// ListObjects lists objects a user has a relation to.
// POST /authz/list-objects
func (h *AuthzHandler) ListObjects(c *fiber.Ctx) error {
	var req model.ListObjectsRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid request body",
		})
	}
	if err := h.validate.Struct(req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	objects, err := h.authz.ListObjects(c.Context(), req)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "list objects failed",
		})
	}

	return c.JSON(model.ListObjectsResponse{Objects: objects})
}
