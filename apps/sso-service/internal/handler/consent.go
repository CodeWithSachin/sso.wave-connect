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
//
//	@Summary		Fetch consent form data
//	@Description	Returns the client, scopes, and tenant context to be displayed on the consent screen.
//	@Tags			oauth2
//	@Produce		json
//	@Param			client_id				query	string	true	"OAuth client ID"
//	@Param			scope					query	string	true	"Requested scopes"
//	@Param			redirect_uri			query	string	true	"Redirect URI"
//	@Param			state					query	string	true	"OAuth state"
//	@Param			tenant_id				query	string	true	"Pinned tenant ID"
//	@Success		200	{object}	map[string]any
//	@Failure		400	{object}	map[string]string
//	@Router			/oauth2/consent [get]
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
		// Phase 5 followup: the pinned tenant_id flows through the consent
		// page as a hidden field so POST /oauth2/consent can re-pin the
		// same tenant that /authorize chose on first touch.
		TenantID: c.Query("tenant_id"),
	})
}

// PostConsent handles POST /oauth2/consent — saves consent decision and redirects.
//
//	@Summary		Submit a consent decision
//	@Description	Records the user's accept/deny decision and resumes the OAuth flow.
//	@Tags			oauth2
//	@Accept			x-www-form-urlencoded
//	@Produce		json
//	@Param			client_id		formData	string	true	"OAuth client ID"
//	@Param			scope			formData	string	true	"Granted scopes"
//	@Param			redirect_uri	formData	string	true	"Redirect URI"
//	@Param			state			formData	string	true	"OAuth state"
//	@Param			tenant_id		formData	string	true	"Pinned tenant ID"
//	@Param			decision		formData	string	true	"`accept` or `deny`"
//	@Success		302	"Redirect to OAuth client or login"
//	@Failure		400	{object}	map[string]string
//	@Router			/oauth2/consent [post]
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

	// Phase 5 followup: prefer the tenant_id pinned at first /authorize
	// touch (submitted as a hidden form field) over the session's current
	// active tenant. Without this, switching tenants between /authorize and
	// the consent POST would silently change which tenant the eventual
	// authorization code is scoped to.
	tenantID, err := resolveConsentTenant(c, client)
	if err != nil {
		return redirectWithError(c, redirectURI, decision.State, "server_error", "tenant resolution failed")
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

// resolveConsentTenant mirrors resolveFlowTenant in oauth2.go — kept separate
// to read form values (POST) rather than query values (GET). Precedence:
//
//  1. Form field `tenant_id` (pinned at first /authorize touch, echoed by UI).
//  2. Session's active_tenant_id.
//  3. Client's TenantID as the final fall-back.
func resolveConsentTenant(c *fiber.Ctx, client *model.OAuthClient) (uuid.UUID, error) {
	if pinnedStr := c.FormValue("tenant_id"); pinnedStr != "" {
		if pinned, err := uuid.Parse(pinnedStr); err == nil {
			return pinned, nil
		}
	}
	if sessionStr, ok := c.Locals("tenantID").(string); ok && sessionStr != "" {
		if parsed, err := uuid.Parse(sessionStr); err == nil {
			return parsed, nil
		}
	}
	return client.TenantID, nil
}
