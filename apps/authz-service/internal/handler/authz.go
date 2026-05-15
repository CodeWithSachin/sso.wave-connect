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
//
//	@Summary		Check a permission
//	@Description	Evaluate whether a user has a given relation to an object.
//	@Tags			authz
//	@Accept			json
//	@Produce		json
//	@Param			body	body		model.CheckRequest	true	"Permission check"
//	@Success		200		{object}	model.CheckResponse
//	@Failure		400		{object}	map[string]string
//	@Failure		500		{object}	map[string]string
//	@Router			/authz/check [post]
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
//
//	@Summary		Batch check permissions
//	@Description	Evaluate up to 50 permission checks in a single request.
//	@Tags			authz
//	@Accept			json
//	@Produce		json
//	@Param			body	body		model.BatchCheckRequest	true	"Batch check"
//	@Success		200		{object}	model.BatchCheckResponse
//	@Failure		400		{object}	map[string]string
//	@Failure		500		{object}	map[string]string
//	@Router			/authz/batch-check [post]
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
//
//	@Summary		List objects
//	@Description	Return all object IDs of a given type to which the user has the requested relation.
//	@Tags			authz
//	@Accept			json
//	@Produce		json
//	@Param			body	body		model.ListObjectsRequest	true	"List objects"
//	@Success		200		{object}	model.ListObjectsResponse
//	@Failure		400		{object}	map[string]string
//	@Failure		500		{object}	map[string]string
//	@Router			/authz/list-objects [post]
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
