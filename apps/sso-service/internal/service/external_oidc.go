package service

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/google/uuid"
	"github.com/rs/zerolog"
	"golang.org/x/oauth2"

	"github.com/wave-connect/sso-platform/apps/sso-service/internal/repository"
)

// ExternalOIDCService consumes a tenant-configured external OIDC IdP
// (Entra, Google Workspace, Okta OIDC, generic OIDC). Owns:
//   - Per-IdP discovery + JWKS cache (5-min TTL by default)
//   - Authorization-URL builder with PKCE
//   - Token exchange + ID-token verification
//
// Construction is lazy + per-IdP — we don't pre-fetch every tenant's
// discovery doc at boot. First request for a given IdP id triggers the
// fetch; subsequent requests within the cache window are cheap.
type ExternalOIDCService struct {
	idpRepo *repository.IdentityProviderRepository
	secrets *SecretsService
	log     zerolog.Logger

	// Per-IdP cache. Key: idp UUID string. Value: configured client wrapper.
	cacheMu sync.RWMutex
	cache   map[string]*cachedIdP
	ttl     time.Duration

	// callbackURL is where sso-service's /idp/oidc/callback lives. Built
	// from the issuer config at boot; threaded through to the oauth2.Config
	// so it matches the registered redirect_uri on the IdP side.
	callbackURL string
}

type cachedIdP struct {
	idp        *repository.IdentityProvider
	provider   *oidc.Provider
	verifier   *oidc.IDTokenVerifier
	oauth2Cfg  *oauth2.Config
	plaintextSecret string // decrypted client secret; cached only in-memory
	expiresAt  time.Time
}

// NewExternalOIDCService builds the service. callbackURL must be the full
// HTTPS URL that the external IdP will POST/redirect back to (i.e.
// `https://sso.wave-connect.com/idp/oidc/callback`). The path of this URL
// must match what was registered in the IdP's app registration; mismatch
// produces an opaque `redirect_uri_mismatch` from the IdP.
func NewExternalOIDCService(
	idpRepo *repository.IdentityProviderRepository,
	secrets *SecretsService,
	callbackURL string,
	log zerolog.Logger,
) *ExternalOIDCService {
	return &ExternalOIDCService{
		idpRepo:     idpRepo,
		secrets:     secrets,
		callbackURL: callbackURL,
		cache:       make(map[string]*cachedIdP),
		ttl:         5 * time.Minute,
		log:         log.With().Str("component", "external_oidc").Logger(),
	}
}

// AuthCodeURL builds the URL we redirect the user to for IdP authentication.
// `state` is the RelayState ID issued by RelayStateStore; the IdP echoes it
// back on the callback so we can rebuild the originating /oauth2/authorize
// context. `pkce` is the code_verifier we'll send at exchange time;
// challenge generation is handled here.
//
// Returns the URL plus the PKCE verifier (caller stores in RelayState so
// it survives the round trip).
func (s *ExternalOIDCService) AuthCodeURL(ctx context.Context, idpID uuid.UUID, state, pkceVerifier string) (string, error) {
	c, err := s.load(ctx, idpID)
	if err != nil {
		return "", err
	}

	// PKCE challenge derived from verifier. Compute as base64url(SHA-256(verifier)).
	challenge := pkceS256Challenge(pkceVerifier)

	url := c.oauth2Cfg.AuthCodeURL(
		state,
		oauth2.SetAuthURLParam("code_challenge", challenge),
		oauth2.SetAuthURLParam("code_challenge_method", "S256"),
	)
	return url, nil
}

// Exchange swaps the authorization code from the IdP for an ID token + user
// claims. Verifies the ID token's signature, issuer, audience, and expiry
// before extracting claims. Returns the verified `sub` + standard profile
// fields the JIT layer needs.
//
// `pkceVerifier` must match the verifier whose challenge was sent on
// AuthCodeURL; the IdP enforces this server-side.
func (s *ExternalOIDCService) Exchange(ctx context.Context, idpID uuid.UUID, code, pkceVerifier string) (*IDTokenClaims, error) {
	c, err := s.load(ctx, idpID)
	if err != nil {
		return nil, err
	}

	tok, err := c.oauth2Cfg.Exchange(
		ctx, code,
		oauth2.SetAuthURLParam("code_verifier", pkceVerifier),
	)
	if err != nil {
		return nil, fmt.Errorf("oauth2 exchange: %w", err)
	}

	rawID, ok := tok.Extra("id_token").(string)
	if !ok || rawID == "" {
		return nil, errors.New("oauth2 exchange: no id_token in response")
	}

	idToken, err := c.verifier.Verify(ctx, rawID)
	if err != nil {
		return nil, fmt.Errorf("id_token verify: %w", err)
	}

	var raw map[string]any
	if err := idToken.Claims(&raw); err != nil {
		return nil, fmt.Errorf("decode id_token claims: %w", err)
	}

	claims := &IDTokenClaims{
		Subject: idToken.Subject,
		Raw:     raw,
	}
	if v, ok := raw["email"].(string); ok {
		claims.Email = v
	}
	if v, ok := raw["name"].(string); ok {
		claims.Name = v
	}
	if v, ok := raw["picture"].(string); ok {
		claims.Picture = v
	}
	if v, ok := raw["preferred_username"].(string); ok {
		claims.PreferredUsername = v
	}
	if v, ok := raw["given_name"].(string); ok {
		claims.GivenName = v
	}
	if v, ok := raw["family_name"].(string); ok {
		claims.FamilyName = v
	}
	return claims, nil
}

// IDTokenClaims is the verified-and-extracted claim set the JIT layer
// consumes. Raw is preserved so attribute-mapping (Slice 3) can read
// custom claims without re-parsing the JWT.
type IDTokenClaims struct {
	Subject           string
	Email             string
	Name              string
	Picture           string
	PreferredUsername string
	GivenName         string
	FamilyName        string
	Raw               map[string]any
}

// load fetches the IdP config and constructs (or returns the cached) OIDC
// client. The discovery doc + JWKS get fetched on cache miss; both have
// short cache lifetimes inside go-oidc itself.
func (s *ExternalOIDCService) load(ctx context.Context, idpID uuid.UUID) (*cachedIdP, error) {
	key := idpID.String()

	s.cacheMu.RLock()
	c, ok := s.cache[key]
	s.cacheMu.RUnlock()
	if ok && time.Now().Before(c.expiresAt) {
		return c, nil
	}

	// Cache miss or expired — rebuild under the write lock. Double-check
	// inside the lock to avoid the thundering-herd race.
	s.cacheMu.Lock()
	defer s.cacheMu.Unlock()
	if c, ok := s.cache[key]; ok && time.Now().Before(c.expiresAt) {
		return c, nil
	}

	idp, err := s.idpRepo.GetActiveByID(ctx, idpID)
	if err != nil {
		return nil, fmt.Errorf("load idp config: %w", err)
	}
	if idp.Type != "oidc" && idp.Type != "social_google" && idp.Type != "social_microsoft" && idp.Type != "social_github" {
		return nil, fmt.Errorf("idp %s is not an OIDC type (got %q)", idpID, idp.Type)
	}
	if idp.OIDCIssuer == "" {
		return nil, fmt.Errorf("idp %s has no oidc_issuer configured", idpID)
	}
	if idp.OIDCClientID == "" || idp.OIDCClientSecretEnc == "" {
		return nil, fmt.Errorf("idp %s missing oidc_client_id or encrypted secret", idpID)
	}

	plaintextSecret, err := s.secrets.Decrypt(idp.OIDCClientSecretEnc)
	if err != nil {
		return nil, fmt.Errorf("decrypt client secret for idp %s: %w", idpID, err)
	}

	provider, err := oidc.NewProvider(ctx, idp.OIDCIssuer)
	if err != nil {
		return nil, fmt.Errorf("oidc discovery for %s: %w", idp.OIDCIssuer, err)
	}

	verifier := provider.Verifier(&oidc.Config{
		ClientID: idp.OIDCClientID,
	})

	scopes := idp.OIDCScopes
	if len(scopes) == 0 {
		scopes = []string{oidc.ScopeOpenID, "profile", "email"}
	}

	oauth2Cfg := &oauth2.Config{
		ClientID:     idp.OIDCClientID,
		ClientSecret: plaintextSecret,
		Endpoint:     provider.Endpoint(),
		RedirectURL:  s.callbackURL,
		Scopes:       scopes,
	}

	c = &cachedIdP{
		idp:             idp,
		provider:        provider,
		verifier:        verifier,
		oauth2Cfg:       oauth2Cfg,
		plaintextSecret: plaintextSecret,
		expiresAt:       time.Now().Add(s.ttl),
	}
	s.cache[key] = c
	return c, nil
}

// pkceS256Challenge computes the S256 challenge for a PKCE verifier:
// base64url(SHA-256(verifier)), no padding (RFC 7636 §4.2).
func pkceS256Challenge(verifier string) string {
	sum := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}
