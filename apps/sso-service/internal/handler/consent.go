package handler

import (
	"errors"
	"fmt"
	"net/url"
	"strings"

	"github.com/go-playground/validator/v10"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/rs/zerolog"

	"github.com/wave-connect/sso-platform/apps/sso-service/internal/model"
	"github.com/wave-connect/sso-platform/apps/sso-service/internal/repository"
	"github.com/wave-connect/sso-platform/apps/sso-service/internal/service"
)

type ConsentHandler struct {
	oauth2Svc   *service.OAuth2Service
	clientRepo  *repository.OAuthClientRepository
	consentRepo *repository.ConsentRepository
	validate    *validator.Validate
	log         zerolog.Logger
}

func NewConsentHandler(
	oauth2Svc *service.OAuth2Service,
	clientRepo *repository.OAuthClientRepository,
	consentRepo *repository.ConsentRepository,
	validate *validator.Validate,
	log zerolog.Logger,
) *ConsentHandler {
	return &ConsentHandler{
		oauth2Svc:   oauth2Svc,
		clientRepo:  clientRepo,
		consentRepo: consentRepo,
		validate:    validate,
		log:         log.With().Str("handler", "consent").Logger(),
	}
}

// GetConsent handles GET /oauth2/consent — returns consent form data.
func (h *ConsentHandler) GetConsent(c *fiber.Ctx) error {
	clientIDParam := c.Query("client_id")
	if clientIDParam == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "client_id is required",
		})
	}

	client, err := h.clientRepo.GetByClientID(c.Context(), clientIDParam)
	if err != nil {
		if errors.Is(err, repository.ErrClientNotFound) {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "unknown client_id",
			})
		}
		h.log.Error().Err(err).Msg("failed to look up client")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "server_error",
		})
	}

	scope := c.Query("scope")
	requestedScopes := strings.Fields(scope)
	if len(requestedScopes) == 0 {
		requestedScopes = client.AllowedScopes
	}

	return c.JSON(&model.ConsentFormData{
		ClientName:      client.Name,
		ClientID:        client.ClientID,
		RequestedScopes: requestedScopes,
		RedirectURI:     c.Query("redirect_uri"),
		State:           c.Query("state"),
	})
}

// PostConsent handles POST /oauth2/consent — saves consent decision and redirects.
func (h *ConsentHandler) PostConsent(c *fiber.Ctx) error {
	decision := &model.ConsentDecision{}
	if err := c.BodyParser(decision); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "failed to parse request body",
		})
	}

	if err := h.validate.Struct(decision); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": fmt.Sprintf("validation failed: %v", err),
		})
	}

	// Get the original authorize params from query/form
	clientIDParam := c.FormValue("client_id")
	redirectURI := c.FormValue("redirect_uri")
	scope := c.FormValue("scope")
	codeChallenge := c.FormValue("code_challenge")
	codeChallengeMethod := c.FormValue("code_challenge_method")
	nonce := c.FormValue("nonce")

	if clientIDParam == "" || redirectURI == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "client_id and redirect_uri are required",
		})
	}

	// Check user authentication
	userIDStr, ok := c.Locals("userID").(string)
	if !ok || userIDStr == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "user not authenticated",
		})
	}
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "invalid session",
		})
	}

	// Look up client
	client, err := h.clientRepo.GetByClientID(c.Context(), clientIDParam)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "unknown client_id",
		})
	}

	tenantIDStr, _ := c.Locals("tenantID").(string)
	tenantID, err := uuid.Parse(tenantIDStr)
	if err != nil {
		tenantID = client.TenantID
	}

	// If user denied consent
	if !decision.Approved {
		return redirectWithError(c, redirectURI, decision.State, "access_denied", "user denied consent")
	}

	// Parse scopes
	scopes := strings.Fields(scope)
	if len(scopes) == 0 {
		scopes = client.AllowedScopes
	}

	// Save consent
	consent := &model.UserConsent{
		UserID:        userID,
		ClientID:      client.ID,
		TenantID:      tenantID,
		GrantedScopes: scopes,
		Status:        "granted",
	}
	if err := h.consentRepo.GrantConsent(c.Context(), consent); err != nil {
		h.log.Error().Err(err).Msg("failed to save consent")
		return redirectWithError(c, redirectURI, decision.State, "server_error", "failed to save consent")
	}

	// Issue authorization code
	code, err := h.oauth2Svc.CreateAuthorizationCode(
		userID, clientIDParam, tenantID, redirectURI,
		scopes, nonce, codeChallenge, codeChallengeMethod,
	)
	if err != nil {
		h.log.Error().Err(err).Msg("failed to create authorization code")
		return redirectWithError(c, redirectURI, decision.State, "server_error", "failed to generate code")
	}

	// Redirect with code
	redirectURL := fmt.Sprintf("%s?code=%s&state=%s",
		redirectURI,
		url.QueryEscape(code),
		url.QueryEscape(decision.State),
	)
	return c.Redirect(redirectURL, fiber.StatusFound)
}
