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
	oauth2Svc     *service.OAuth2Service
	oidcSvc       *service.OIDCService
	clientRepo    *repository.OAuthClientRepository
	consentRepo   *repository.ConsentRepository
	userRepo      *repository.UserRepository
	codeTracker   *repository.AuthCodeTracker
	idpInitiator  service.IdPInitiator
	validate      *validator.Validate
	log           zerolog.Logger
	loginURL      string
}

func NewOAuth2Handler(
	oauth2Svc *service.OAuth2Service,
	oidcSvc *service.OIDCService,
	clientRepo *repository.OAuthClientRepository,
	consentRepo *repository.ConsentRepository,
	userRepo *repository.UserRepository,
	codeTracker *repository.AuthCodeTracker,
	idpInitiator service.IdPInitiator,
	validate *validator.Validate,
	log zerolog.Logger,
	loginURL string,
) *OAuth2Handler {
	return &OAuth2Handler{
		oauth2Svc:    oauth2Svc,
		oidcSvc:      oidcSvc,
		clientRepo:   clientRepo,
		consentRepo:  consentRepo,
		userRepo:     userRepo,
		codeTracker:  codeTracker,
		idpInitiator: idpInitiator,
		validate:     validate,
		log:          log.With().Str("handler", "oauth2").Logger(),
		loginURL:     loginURL,
	}
}

// Authorize handles GET /oauth2/authorize — the OAuth2 authorization endpoint.
//
//	@Summary		OAuth2 authorization endpoint
//	@Description	Initiates an OAuth2/OIDC authorization-code flow. May redirect to the login portal, an external IdP, or the consent screen.
//	@Tags			oauth2
//	@Produce		json
//	@Param			client_id				query		string	true	"Registered OAuth client ID"
//	@Param			response_type			query		string	true	"Must be `code`"
//	@Param			redirect_uri			query		string	true	"Redirect URI registered with the client"
//	@Param			scope					query		string	false	"Space-separated scopes"
//	@Param			state					query		string	false	"Opaque value returned to the client"
//	@Param			code_challenge			query		string	false	"PKCE challenge"
//	@Param			code_challenge_method	query		string	false	"PKCE method (S256)"
//	@Param			nonce					query		string	false	"OIDC nonce"
//	@Param			idp_hint				query		string	false	"External IdP ID for federated auth"
//	@Success		302	"Redirect to login portal, IdP, consent, or the client's redirect_uri"
//	@Failure		400	{object}	model.OAuthErrorResponse
//	@Router			/oauth2/authorize [get]
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

	// External IdP routing — branch BEFORE the local auth check. When
	// `idp_hint` is present, the user delegates authentication to an external
	// IdP (Entra, Google, Okta, generic SAML/OIDC) rather than to our
	// login-portal. Slice 1 ships the param-parsing + stub; Slices 2 & 4 land
	// the OIDC and SAML implementations respectively.
	if req.IdPHint != "" {
		initiateRes, err := h.idpInitiator.Initiate(c.Context(), service.InitiateRequest{
			IdPID:          req.IdPHint,
			DiscoverToken:  req.DiscoverToken,
			OAuthState:     req.State,
			RedirectURI:    req.RedirectURI,
			ClientID:       req.ClientID,
			Scopes:         scopes,
			CodeChallenge:  req.CodeChallenge,
			CodeChallengeM: req.CodeChallengeMethod,
			Nonce:          req.Nonce,
			UserAgent:      c.Get("User-Agent"),
			ClientIP:       c.IP(),
		})
		if err != nil {
			if errors.Is(err, service.ErrIdPNotImplemented) {
				// Stable 501 with a documented body — keeps Slice 1 demoable
				// without breaking password flows.
				return c.Status(fiber.StatusNotImplemented).JSON(fiber.Map{
					"error":             "not_implemented",
					"error_description": "external IdP runtime ships in Milestone A Slice 2 (OIDC) / Slice 4 (SAML)",
					"idp_id":            req.IdPHint,
				})
			}
			h.log.Error().Err(err).Str("idp_id", req.IdPHint).Msg("idp initiator failed")
			return redirectWithError(c, req.RedirectURI, req.State, "server_error", "external IdP routing failed")
		}
		return c.Redirect(initiateRes.RedirectURL, fiber.StatusFound)
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

	// Phase 5 followup: pin the tenant at first /authorize touch. The query
	// may already carry `tenant_id` — that happens when the user comes back
	// from consent. In that case we trust the form-supplied value, not the
	// session's current active tenant. This closes the race where the user
	// switches their active tenant between the initial /authorize redirect
	// (to consent) and the eventual authorization-code issuance: without
	// this, the code would be minted for the new active tenant, leaking
	// old-tenant data to the OAuth client.
	//
	// On first touch (no tenant_id in the query), we anchor at the session's
	// current active tenant — same as pre-Phase-5 behavior — then carry
	// that value forward through consent.
	tenantID, err := resolveFlowTenant(c, client)
	if err != nil {
		return redirectWithError(c, req.RedirectURI, req.State, "server_error", "tenant resolution failed")
	}

	// Check consent: skip for first-party clients
	if !client.IsFirstParty && client.RequireConsent {
		consent, err := h.consentRepo.GetConsent(c.Context(), tenantID, userID, client.ID)
		if err != nil {
			if errors.Is(err, repository.ErrConsentNotFound) {
				return c.Redirect(buildConsentURL(req, tenantID), fiber.StatusFound)
			}
			h.log.Error().Err(err).Msg("failed to check consent")
			return redirectWithError(c, req.RedirectURI, req.State, "server_error", "internal error")
		}

		// Check that all requested scopes are covered by the consent
		if !scopesCovered(scopes, consent.GrantedScopes) {
			return c.Redirect(buildConsentURL(req, tenantID), fiber.StatusFound)
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
//
//	@Summary		OAuth2 token endpoint
//	@Description	Exchange an authorization code or refresh token for access/refresh/ID tokens.
//	@Tags			oauth2
//	@Accept			x-www-form-urlencoded
//	@Produce		json
//	@Param			grant_type		formData	string	true	"authorization_code or refresh_token"
//	@Param			code			formData	string	false	"Authorization code (authorization_code grant)"
//	@Param			redirect_uri	formData	string	false	"Redirect URI used in /authorize"
//	@Param			client_id		formData	string	false	"OAuth client ID (or via Basic auth)"
//	@Param			client_secret	formData	string	false	"OAuth client secret (or via Basic auth)"
//	@Param			refresh_token	formData	string	false	"Refresh token (refresh_token grant)"
//	@Param			code_verifier	formData	string	false	"PKCE verifier"
//	@Success		200	{object}	model.TokenResponse
//	@Failure		400	{object}	model.OAuthErrorResponse
//	@Failure		401	{object}	model.OAuthErrorResponse
//	@Router			/oauth2/token [post]
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

	// Single-use check: prevent authorization code replay
	if h.codeTracker != nil {
		firstUse, err := h.codeTracker.MarkUsed(c.Context(), req.Code)
		if err != nil {
			h.log.Warn().Err(err).Msg("auth code tracker failed; allowing (fail-open)")
		} else if !firstUse {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error":             "invalid_grant",
				"error_description": "authorization code has already been used",
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
		email, displayName, picture := h.loadUserClaims(c, authCode.UserID, authCode.Scopes)
		idToken, err := h.oidcSvc.BuildIDToken(
			authCode.UserID, email, displayName, picture,
			authCode.TenantID, authCode.ClientID,
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

// loadUserClaims fetches the email / display_name / avatar_url for a user,
// short-circuiting when the requested scopes don't grant any of those
// claims (saves a DB roundtrip on token grants that only requested openid).
// Returns empty strings on lookup failure — BuildIDToken correctly omits
// empty claims so a transient DB error degrades to a claim-less token
// rather than a 500. The failure is logged for observability.
func (h *OAuth2Handler) loadUserClaims(c *fiber.Ctx, userID uuid.UUID, scopes []string) (email, displayName, picture string) {
	wantEmail := containsScope("email", scopes)
	wantProfile := containsScope("profile", scopes)
	if !wantEmail && !wantProfile {
		return "", "", ""
	}
	user, err := h.userRepo.GetByID(c.Context(), userID)
	if err != nil {
		h.log.Warn().Err(err).Str("user_id", userID.String()).Msg("failed to load user for ID token claims")
		return "", "", ""
	}
	if wantEmail {
		email = user.Email
	}
	if wantProfile {
		displayName = user.DisplayName
		picture = user.AvatarURL
	}
	return email, displayName, picture
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
		email, displayName, picture := h.loadUserClaims(c, userID, scopes)
		idToken, err := h.oidcSvc.BuildIDToken(
			userID, email, displayName, picture,
			client.TenantID, client.ClientID, scopes, "",
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

// resolveFlowTenant picks the tenant to pin on an OAuth2 auth-code flow.
//
// Order of precedence:
//  1. Query param `tenant_id` (present when the user comes back from consent;
//     this is the value pinned at first /authorize touch).
//  2. Session's active_tenant_id from c.Locals("tenantID").
//  3. Client's own TenantID (fall-back; only hit when the session has no
//     tenant context, e.g. an unauthenticated request that's about to
//     redirect to login anyway).
//
// Returning a non-nil error reserved for future validation hooks (e.g.
// rejecting a tenant the user doesn't belong to). Currently always returns
// nil but the signature future-proofs the handler.
func resolveFlowTenant(c *fiber.Ctx, client *model.OAuthClient) (uuid.UUID, error) {
	if pinnedStr := c.Query("tenant_id"); pinnedStr != "" {
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

// buildConsentURL constructs the /oauth2/consent redirect URL with the
// pinned tenant_id preserved across the round-trip. The consent page
// re-renders this value as a hidden form field so the POST /oauth2/consent
// handler gets the same tenant that /authorize pinned.
func buildConsentURL(req *model.AuthorizeRequest, tenantID uuid.UUID) string {
	return fmt.Sprintf("/oauth2/consent?client_id=%s&scope=%s&redirect_uri=%s&state=%s&code_challenge=%s&code_challenge_method=%s&nonce=%s&tenant_id=%s",
		url.QueryEscape(req.ClientID),
		url.QueryEscape(req.Scope),
		url.QueryEscape(req.RedirectURI),
		url.QueryEscape(req.State),
		url.QueryEscape(req.CodeChallenge),
		url.QueryEscape(req.CodeChallengeMethod),
		url.QueryEscape(req.Nonce),
		url.QueryEscape(tenantID.String()),
	)
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
