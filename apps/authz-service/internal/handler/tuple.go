package handler

import (
	"github.com/go-playground/validator/v10"
	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog"

	"github.com/wave-connect/sso-platform/apps/authz-service/internal/model"
	"github.com/wave-connect/sso-platform/apps/authz-service/internal/service"
)

// TupleHandler handles relationship tuple write/delete endpoints.
type TupleHandler struct {
	authz    *service.AuthzService
	validate *validator.Validate
	log      zerolog.Logger
}

// NewTupleHandler creates a new tuple handler.
func NewTupleHandler(authz *service.AuthzService, validate *validator.Validate, log zerolog.Logger) *TupleHandler {
	return &TupleHandler{
		authz:    authz,
		validate: validate,
		log:      log.With().Str("component", "tuple-handler").Logger(),
	}
}

// Write writes and/or deletes relationship tuples.
//
//	@Summary		Write or delete tuples
//	@Description	Batch write and/or delete OpenFGA relationship tuples.
//	@Tags			tuples
//	@Accept			json
//	@Produce		json
//	@Param			body	body		model.TupleWriteRequest	true	"Tuple writes and deletes"
//	@Success		200		{object}	map[string]int
//	@Failure		400		{object}	map[string]string
//	@Failure		500		{object}	map[string]string
//	@Router			/authz/tuples [post]
func (h *TupleHandler) Write(c *fiber.Ctx) error {
	var req model.TupleWriteRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid request body",
		})
	}

	if len(req.Writes) == 0 && len(req.Deletes) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "at least one write or delete is required",
		})
	}

	// Validate individual tuples
	for _, w := range req.Writes {
		if err := h.validate.Struct(w); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": err.Error(),
			})
		}
	}
	for _, d := range req.Deletes {
		if err := h.validate.Struct(d); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": err.Error(),
			})
		}
	}

	// Write tuples
	if len(req.Writes) > 0 {
		if err := h.authz.WriteTuples(c.Context(), req.Writes); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "failed to write tuples",
			})
		}
	}

	// Delete tuples
	if len(req.Deletes) > 0 {
		if err := h.authz.DeleteTuples(c.Context(), req.Deletes); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "failed to delete tuples",
			})
		}
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"writes":  len(req.Writes),
		"deletes": len(req.Deletes),
	})
}

// Delete removes relationship tuples.
//
//	@Summary		Delete tuples
//	@Description	Remove a batch of OpenFGA relationship tuples.
//	@Tags			tuples
//	@Accept			json
//	@Produce		json
//	@Param			body	body		[]model.TupleWrite	true	"Tuples to delete"
//	@Success		200		{object}	map[string]int
//	@Failure		400		{object}	map[string]string
//	@Failure		500		{object}	map[string]string
//	@Router			/authz/tuples [delete]
func (h *TupleHandler) Delete(c *fiber.Ctx) error {
	var tuples []model.TupleWrite
	if err := c.BodyParser(&tuples); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid request body",
		})
	}

	if len(tuples) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "at least one tuple is required",
		})
	}

	for _, t := range tuples {
		if err := h.validate.Struct(t); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": err.Error(),
			})
		}
	}

	if err := h.authz.DeleteTuples(c.Context(), tuples); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "failed to delete tuples",
		})
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"deleted": len(tuples),
	})
}
