package handler

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/rs/zerolog"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	pb "github.com/wave-connect/sso-platform/libs/proto/gen/go/identity/v1"

	"github.com/wave-connect/sso-platform/apps/sso-service/internal/service"
)

// OIDCCallbackHandler closes the external-IdP loop. The IdP redirects the
// user's browser to GET /idp/oidc/callback?code=...&state=... and we:
//
//  1. Consume the RelayState (looks up oauth flow + tenant + PKCE verifier).
//  2. Exchange the code with the IdP via ExternalOIDCService.
//  3. Call identity-service ProvisionFederated gRPC to JIT-create or refresh
//     the local user and mint a session.
//  4. Set the sso_session cookie.
//  5. Mint a WaveConnect authorization code for the ORIGINAL /oauth2/authorize
//     request's client and redirect there with ?code=...&state=<original>.
//
// Error paths render a typed error response — Slice 3 swaps these for HTML
// pages; Slice 2 ships JSON 4xx/5xx.
type OIDCCallbackHandler struct {
	oidc        *service.ExternalOIDCService
	relay       *service.RelayStateStore
	oauth2Svc   *service.OAuth2Service
	identityCli pb.IdentityServiceClient
	cookieCfg   CookieConfig
	log         zerolog.Logger
}

// CookieConfig is the per-environment cookie shape for sso_session writes.
// Matches identity-service's `setSSOCookie` so the two writers produce
// indistinguishable cookies regardless of which entry point minted them.
type CookieConfig struct {
	Name     string // typically "sso_session"
	Path     string // typically "/"
	Domain   string // empty = current host
	Secure   bool   // true in staging/prod
	SameSite string // "Lax" — see Slice 4 for IdP-initiated SAML which forces "None"
}

func NewOIDCCallbackHandler(
	oidc *service.ExternalOIDCService,
	relay *service.RelayStateStore,
	oauth2Svc *service.OAuth2Service,
	identityCli pb.IdentityServiceClient,
	cookieCfg CookieConfig,
	log zerolog.Logger,
) *OIDCCallbackHandler {
	if cookieCfg.Name == "" {
		cookieCfg.Name = "sso_session"
	}
	if cookieCfg.Path == "" {
		cookieCfg.Path = "/"
	}
	if cookieCfg.SameSite == "" {
		cookieCfg.SameSite = "Lax"
	}
	return &OIDCCallbackHandler{
		oidc:        oidc,
		relay:       relay,
		oauth2Svc:   oauth2Svc,
		identityCli: identityCli,
		cookieCfg:   cookieCfg,
		log:         log.With().Str("handler", "idp_oidc").Logger(),
	}
}

// Callback handles GET /idp/oidc/callback?code=...&state=...
func (h *OIDCCallbackHandler) Callback(c *fiber.Ctx) error {
	code := c.Query("code")
	stateID := c.Query("state")
	if code == "" || stateID == "" {
		return h.fail(c, fiber.StatusBadRequest, "missing_code_or_state",
			"the IdP did not return both a code and a state parameter")
	}

	// 1. Consume relay state (single-use; replay-safe).
	relay, err := h.relay.Consume(c.Context(), stateID)
	if err != nil {
		return h.fail(c, fiber.StatusBadRequest, "invalid_state",
			"relay state expired or already consumed — restart sign-in")
	}

	idpID, err := uuid.Parse(relay.IdPID)
	if err != nil {
		return h.fail(c, fiber.StatusInternalServerError, "bad_state_idp_id",
			"corrupted relay state")
	}

	// Pull PKCE verifier out of the ReturnTo carrier field (issued in
	// OIDCIdPInitiator.Initiate).
	pkceVerifier := strings.TrimPrefix(relay.ReturnTo, "pkce:")
	if pkceVerifier == relay.ReturnTo || pkceVerifier == "" {
		return h.fail(c, fiber.StatusInternalServerError, "missing_pkce",
			"relay state missing PKCE verifier")
	}

	// 2. Exchange code with the IdP.
	claims, err := h.oidc.Exchange(c.Context(), idpID, code, pkceVerifier)
	if err != nil {
		h.log.Warn().Err(err).Str("idp_id", relay.IdPID).Msg("OIDC exchange failed")
		return h.fail(c, fiber.StatusBadGateway, "exchange_failed",
			"could not complete authentication with the identity provider")
	}
	if claims.Subject == "" {
		return h.fail(c, fiber.StatusBadGateway, "missing_sub",
			"identity provider returned no subject claim")
	}

	// 3. JIT-provision (or refresh) via identity-service.
	pctx, cancel := context.WithTimeout(c.Context(), 3*time.Second)
	defer cancel()
	prov, err := h.identityCli.ProvisionFederated(pctx, &pb.ProvisionFederatedRequest{
		IdpId:          relay.IdPID,
		ExternalUserId: claims.Subject,
		Email:          claims.Email,
		DisplayName:    chooseName(claims),
		Picture:        claims.Picture,
		Ip:             c.IP(),
		UserAgent:      c.Get("User-Agent"),
	})
	if err != nil {
		st, ok := status.FromError(err)
		if ok && st.Code() == codes.FailedPrecondition {
			return h.fail(c, fiber.StatusForbidden, "jit_disabled",
				"this IdP does not auto-provision new users; ask your administrator to invite you first")
		}
		h.log.Error().Err(err).Msg("ProvisionFederated gRPC failed")
		return h.fail(c, fiber.StatusBadGateway, "provision_failed",
			"could not complete user provisioning")
	}

	// 4. Write the sso_session cookie.
	h.setSSOSessionCookie(c, prov.SessionToken, prov.ExpiresAt)

	// 5. Mint the WaveConnect authorization code for the ORIGINAL OAuth flow.
	tenantID, err := uuid.Parse(prov.TenantId)
	if err != nil {
		return h.fail(c, fiber.StatusInternalServerError, "bad_tenant_id",
			"identity service returned a malformed tenant_id")
	}
	userID, err := uuid.Parse(prov.UserId)
	if err != nil {
		return h.fail(c, fiber.StatusInternalServerError, "bad_user_id",
			"identity service returned a malformed user_id")
	}
	authCode, err := h.oauth2Svc.CreateAuthorizationCode(
		userID, relay.ClientID, tenantID, relay.RedirectURI,
		relay.Scopes, relay.Nonce, relay.CodeChallenge, relay.CodeChallengeMethod,
	)
	if err != nil {
		h.log.Error().Err(err).Msg("CreateAuthorizationCode failed after federation")
		return h.fail(c, fiber.StatusInternalServerError, "code_mint_failed",
			"could not generate authorization code")
	}

	// Final redirect — back to the OAuth client's redirect_uri with code +
	// state. This completes the original /oauth2/authorize round-trip; the
	// client (e.g., Miles Django) exchanges code for tokens next.
	redirectURL := fmt.Sprintf(
		"%s?code=%s&state=%s",
		relay.RedirectURI,
		url.QueryEscape(authCode),
		url.QueryEscape(relay.OAuthState),
	)
	return c.Redirect(redirectURL, fiber.StatusFound)
}

// setSSOSessionCookie writes the cookie identity-service would have written
// on a password login — same attributes, so downstream services (admin-api,
// developer-portal-api) validate it identically regardless of which entry
// point minted the session.
func (h *OIDCCallbackHandler) setSSOSessionCookie(c *fiber.Ctx, rawToken string, expiresUnix int64) {
	expires := time.Unix(expiresUnix, 0).UTC()
	maxAge := int(time.Until(expires).Seconds())
	if maxAge < 0 {
		maxAge = 0
	}
	c.Cookie(&fiber.Cookie{
		Name:     h.cookieCfg.Name,
		Value:    rawToken,
		Path:     h.cookieCfg.Path,
		Domain:   h.cookieCfg.Domain,
		MaxAge:   maxAge,
		Expires:  expires,
		Secure:   h.cookieCfg.Secure,
		HTTPOnly: true,
		SameSite: h.cookieCfg.SameSite,
	})
}

// fail renders a typed error envelope. Slice 3 replaces the JSON body with
// an HTML error page; the shape stays the same for API consumers.
func (h *OIDCCallbackHandler) fail(c *fiber.Ctx, statusCode int, errCode, message string) error {
	correlationID := c.Get("X-Request-ID")
	if correlationID == "" {
		correlationID = uuid.New().String()
	}
	h.log.Warn().Str("error", errCode).Str("correlation_id", correlationID).Msg(message)
	return c.Status(statusCode).JSON(fiber.Map{
		"error":             errCode,
		"error_description": message,
		"correlation_id":    correlationID,
	})
}

// chooseName picks a sensible display-name claim: `name` first (most IdPs),
// then "given family", then preferred_username, then email-local-part. Slice
// 3's attribute_mapper makes this configurable per IdP.
func chooseName(c *service.IDTokenClaims) string {
	if c.Name != "" {
		return c.Name
	}
	switch {
	case c.GivenName != "" && c.FamilyName != "":
		return c.GivenName + " " + c.FamilyName
	case c.GivenName != "":
		return c.GivenName
	case c.PreferredUsername != "":
		return c.PreferredUsername
	}
	if at := strings.IndexByte(c.Email, '@'); at > 0 {
		return c.Email[:at]
	}
	return c.Email
}

// Suppress unused-import warning for errors.As when none of the alt paths
// fire — retained because Slice 3 will switch on more typed errors.
var _ = errors.As
