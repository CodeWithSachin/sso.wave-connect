package handler

import (
	"encoding/base64"
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

type OAuth2Handler struct {
	oauth2Svc   *service.OAuth2Service
	oidcSvc     *service.OIDCService
	clientRepo  *repository.OAuthClientRepository
	consentRepo *repository.ConsentRepository
	validate    *validator.Validate
	log         zerolog.Logger
	loginURL    string
}

func NewOAuth2Handler(
	oauth2Svc *service.OAuth2Service,
	oidcSvc *service.OIDCService,
	clientRepo *repository.OAuthClientRepository,
	consentRepo *repository.ConsentRepository,
	validate *validator.Validate,
	log zerolog.Logger,
	loginURL string,
) *OAuth2Handler {
	return &OAuth2Handler{
		oauth2Svc:   oauth2Svc,
		oidcSvc:     oidcSvc,
		clientRepo:  clientRepo,
		consentRepo: consentRepo,
		validate:    validate,
		log:         log.With().Str("handler", "oauth2").Logger(),
		loginURL:    loginURL,
	}
}

// Authorize handles GET /oauth2/authorize — the OAuth2 authorization endpoint.
func (h *OAuth2Handler) Authorize(c *fiber.Ctx) error {
	req := &model.AuthorizeRequest{}
	if err := c.QueryParser(req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error":             "invalid_request",
			"error_description": "failed to parse query parameters",
		})
	}

	if err := h.validate.Struct(req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error":             "invalid_request",
			"error_description": fmt.Sprintf("validation failed: %v", err),
		})
	}

	// Look up the OAuth client
	client, err := h.clientRepo.GetByClientID(c.Context(), req.ClientID)
	if err != nil {
		if errors.Is(err, repository.ErrClientNotFound) {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error":             "invalid_client",
				"error_description": "unknown client_id",
			})
		}
		h.log.Error().Err(err).Msg("failed to look up client")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "server_error",
		})
	}

	if !client.IsActive {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error":             "invalid_client",
			"error_description": "client is not active",
		})
	}

	// Validate redirect_uri
	if !service.ValidateRedirectURI(req.RedirectURI, client.RedirectURIs) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error":             "invalid_request",
			"error_description": "redirect_uri not allowed",
		})
	}

	// Validate scopes
	scopes, valid := service.ValidateScopes(req.Scope, client.AllowedScopes)
	if !valid {
		return redirectWithError(c, req.RedirectURI, req.State, "invalid_scope", "requested scope not allowed")
	}

	// Validate PKCE requirement
	if client.RequirePKCE && req.CodeChallenge == "" {
		return redirectWithError(c, req.RedirectURI, req.State, "invalid_request", "code_challenge required")
	}
	if req.CodeChallenge != "" && req.CodeChallengeMethod != "S256" {
		return redirectWithError(c, req.RedirectURI, req.State, "invalid_request", "only S256 code_challenge_method is supported")
	}

	// Validate grant type
	if !service.ContainsGrantType("authorization_code", client.AllowedGrantTypes) {
		return redirectWithError(c, req.RedirectURI, req.State, "unauthorized_client", "client not authorized for authorization_code grant")
	}

	// Check if user is authenticated (userID set by auth middleware)
	userIDStr, ok := c.Locals("userID").(string)
	if !ok || userIDStr == "" {
		// Redirect to login portal with full return URL (include sso-service origin)
		scheme := c.Protocol()
		host := c.Hostname()
		returnURL := fmt.Sprintf("%s://%s%s", scheme, host, c.OriginalURL())
		loginRedirect := fmt.Sprintf("%s?return_to=%s", h.loginURL, url.QueryEscape(returnURL))
		return c.Redirect(loginRedirect, fiber.StatusFound)
	}

	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "invalid session",
		})
	}

	tenantIDStr, _ := c.Locals("tenantID").(string)
	tenantID, err := uuid.Parse(tenantIDStr)
	if err != nil {
		tenantID = client.TenantID
	}

	// Check consent: skip for first-party clients
	if !client.IsFirstParty && client.RequireConsent {
		consent, err := h.consentRepo.GetConsent(c.Context(), tenantID, userID, client.ID)
		if err != nil {
			if errors.Is(err, repository.ErrConsentNotFound) {
				// Redirect to consent page
				consentURL := fmt.Sprintf("/oauth2/consent?client_id=%s&scope=%s&redirect_uri=%s&state=%s&code_challenge=%s&code_challenge_method=%s&nonce=%s",
					url.QueryEscape(req.ClientID),
					url.QueryEscape(req.Scope),
					url.QueryEscape(req.RedirectURI),
					url.QueryEscape(req.State),
					url.QueryEscape(req.CodeChallenge),
					url.QueryEscape(req.CodeChallengeMethod),
					url.QueryEscape(req.Nonce),
				)
				return c.Redirect(consentURL, fiber.StatusFound)
			}
			h.log.Error().Err(err).Msg("failed to check consent")
			return redirectWithError(c, req.RedirectURI, req.State, "server_error", "internal error")
		}

		// Check that all requested scopes are covered by the consent
		if !scopesCovered(scopes, consent.GrantedScopes) {
			consentURL := fmt.Sprintf("/oauth2/consent?client_id=%s&scope=%s&redirect_uri=%s&state=%s&code_challenge=%s&code_challenge_method=%s&nonce=%s",
				url.QueryEscape(req.ClientID),
				url.QueryEscape(req.Scope),
				url.QueryEscape(req.RedirectURI),
				url.QueryEscape(req.State),
				url.QueryEscape(req.CodeChallenge),
				url.QueryEscape(req.CodeChallengeMethod),
				url.QueryEscape(req.Nonce),
			)
			return c.Redirect(consentURL, fiber.StatusFound)
		}
	}

	// Issue authorization code
	code, err := h.oauth2Svc.CreateAuthorizationCode(
		userID, req.ClientID, tenantID, req.RedirectURI,
		scopes, req.Nonce, req.CodeChallenge, req.CodeChallengeMethod,
	)
	if err != nil {
		h.log.Error().Err(err).Msg("failed to create authorization code")
		return redirectWithError(c, req.RedirectURI, req.State, "server_error", "failed to generate code")
	}

	// Redirect with code and state
	redirectURL := fmt.Sprintf("%s?code=%s&state=%s", req.RedirectURI, url.QueryEscape(code), url.QueryEscape(req.State))
	return c.Redirect(redirectURL, fiber.StatusFound)
}

// Token handles POST /oauth2/token — the token endpoint.
func (h *OAuth2Handler) Token(c *fiber.Ctx) error {
	req := &model.TokenRequest{}
	if err := c.BodyParser(req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error":             "invalid_request",
			"error_description": "failed to parse request body",
		})
	}

	// Support client_secret_basic auth
	if req.ClientID == "" {
		basicUser, basicPass, ok := parseBasicAuth(c.Get("Authorization"))
		if ok {
			req.ClientID = basicUser
			req.ClientSecret = basicPass
		}
	}

	if req.ClientID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error":             "invalid_request",
			"error_description": "client_id is required",
		})
	}

	switch req.GrantType {
	case "authorization_code":
		return h.handleAuthorizationCodeGrant(c, req)
	case "refresh_token":
		return h.handleRefreshTokenGrant(c, req)
	default:
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error":             "unsupported_grant_type",
			"error_description": fmt.Sprintf("grant_type %q is not supported", req.GrantType),
		})
	}
}

func (h *OAuth2Handler) handleAuthorizationCodeGrant(c *fiber.Ctx, req *model.TokenRequest) error {
	if req.Code == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error":             "invalid_request",
			"error_description": "code is required",
		})
	}

	// Look up client
	client, err := h.clientRepo.GetByClientID(c.Context(), req.ClientID)
	if err != nil {
		if errors.Is(err, repository.ErrClientNotFound) {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "invalid_client",
			})
		}
		h.log.Error().Err(err).Msg("failed to look up client")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "server_error",
		})
	}

	// Authenticate confidential clients
	if !client.IsPublic {
		if !authenticateClient(client, req.ClientSecret) {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "invalid_client",
			})
		}
	}

	// Exchange the code
	authCode, err := h.oauth2Svc.ExchangeCode(req.Code, req.ClientID, req.RedirectURI, req.CodeVerifier)
	if err != nil {
		h.log.Warn().Err(err).Msg("code exchange failed")
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error":             "invalid_grant",
			"error_description": err.Error(),
		})
	}

	// Build tokens
	accessToken, expiresIn, err := h.oidcSvc.BuildAccessToken(
		authCode.UserID, "", authCode.TenantID, authCode.ClientID, authCode.Scopes,
	)
	if err != nil {
		h.log.Error().Err(err).Msg("failed to build access token")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "server_error",
		})
	}

	resp := &model.TokenResponse{
		AccessToken: accessToken,
		TokenType:   "Bearer",
		ExpiresIn:   expiresIn,
		Scope:       strings.Join(authCode.Scopes, " "),
	}

	// Build refresh token if allowed
	if service.ContainsGrantType("refresh_token", client.AllowedGrantTypes) {
		refreshToken, err := h.oidcSvc.BuildRefreshToken(
			authCode.UserID, authCode.TenantID, authCode.ClientID, authCode.Scopes,
		)
		if err != nil {
			h.log.Error().Err(err).Msg("failed to build refresh token")
		} else {
			resp.RefreshToken = refreshToken
		}
	}

	// Build ID token if openid scope requested
	if containsScope("openid", authCode.Scopes) {
		idToken, err := h.oidcSvc.BuildIDToken(
			authCode.UserID, "", "", authCode.TenantID, authCode.ClientID,
			authCode.Scopes, authCode.Nonce,
		)
		if err != nil {
			h.log.Error().Err(err).Msg("failed to build id token")
		} else {
			resp.IDToken = idToken
		}
	}

	return c.JSON(resp)
}

func (h *OAuth2Handler) handleRefreshTokenGrant(c *fiber.Ctx, req *model.TokenRequest) error {
	if req.RefreshToken == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error":             "invalid_request",
			"error_description": "refresh_token is required",
		})
	}

	client, err := h.clientRepo.GetByClientID(c.Context(), req.ClientID)
	if err != nil {
		if errors.Is(err, repository.ErrClientNotFound) {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "invalid_client",
			})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "server_error",
		})
	}

	if !client.IsPublic {
		if !authenticateClient(client, req.ClientSecret) {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "invalid_client",
			})
		}
	}

	if !service.ContainsGrantType("refresh_token", client.AllowedGrantTypes) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error":             "unsupported_grant_type",
			"error_description": "client not authorized for refresh_token grant",
		})
	}

	// Decrypt the refresh token to extract claims
	refreshToken, err := h.oidcSvc.DecryptAccessToken(req.RefreshToken, client.TenantID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error":             "invalid_grant",
			"error_description": "invalid refresh token",
		})
	}

	var tokenType string
	if err := refreshToken.Get("type", &tokenType); err != nil || tokenType != "refresh" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error":             "invalid_grant",
			"error_description": "token is not a refresh token",
		})
	}

	sub, err := refreshToken.GetSubject()
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid_grant",
		})
	}
	userID, err := uuid.Parse(sub)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid_grant",
		})
	}

	var scopes []string
	_ = refreshToken.Get("scopes", &scopes)

	// Issue new access token
	accessToken, expiresIn, err := h.oidcSvc.BuildAccessToken(
		userID, "", client.TenantID, client.ClientID, scopes,
	)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "server_error",
		})
	}

	// Issue new refresh token (rotation)
	newRefreshToken, err := h.oidcSvc.BuildRefreshToken(userID, client.TenantID, client.ClientID, scopes)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "server_error",
		})
	}

	resp := &model.TokenResponse{
		AccessToken:  accessToken,
		TokenType:    "Bearer",
		ExpiresIn:    expiresIn,
		RefreshToken: newRefreshToken,
		Scope:        strings.Join(scopes, " "),
	}

	if containsScope("openid", scopes) {
		idToken, err := h.oidcSvc.BuildIDToken(
			userID, "", "", client.TenantID, client.ClientID, scopes, "",
		)
		if err != nil {
			h.log.Error().Err(err).Msg("failed to build id token on refresh")
		} else {
			resp.IDToken = idToken
		}
	}

	return c.JSON(resp)
}

// --- helpers ---

func redirectWithError(c *fiber.Ctx, redirectURI, state, errorCode, description string) error {
	u := fmt.Sprintf("%s?error=%s&error_description=%s",
		redirectURI,
		url.QueryEscape(errorCode),
		url.QueryEscape(description),
	)
	if state != "" {
		u += "&state=" + url.QueryEscape(state)
	}
	return c.Redirect(u, fiber.StatusFound)
}

func scopesCovered(requested, granted []string) bool {
	grantedSet := make(map[string]struct{}, len(granted))
	for _, s := range granted {
		grantedSet[s] = struct{}{}
	}
	for _, s := range requested {
		if _, ok := grantedSet[s]; !ok {
			return false
		}
	}
	return true
}

func containsScope(scope string, scopes []string) bool {
	for _, s := range scopes {
		if s == scope {
			return true
		}
	}
	return false
}

func authenticateClient(client *model.OAuthClient, secret string) bool {
	// For now, simple comparison. In production, use bcrypt/argon2.
	if client.ClientSecretHash == nil {
		return false
	}
	return *client.ClientSecretHash == secret
}

func parseBasicAuth(header string) (user, pass string, ok bool) {
	if !strings.HasPrefix(header, "Basic ") {
		return "", "", false
	}
	decoded, err := base64.StdEncoding.DecodeString(header[6:])
	if err != nil {
		return "", "", false
	}
	parts := strings.SplitN(string(decoded), ":", 2)
	if len(parts) != 2 {
		return "", "", false
	}
	return parts[0], parts[1], true
}
