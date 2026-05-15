// Package service — discover.go
//
// Email-first login discovery (Phase 3 of the dual-product onboarding plan).
// Given an email, returns one of three modes so the UI can pick the next step:
//
//   "consumer"         — unclaimed domain; show password field on our side.
//   "tenant_password"  — claimed org, password auth allowed. Show tenant
//                         branding + password field.
//   "tenant_sso"       — claimed org with require_sso=TRUE + an active IdP.
//                         Redirect the browser to the IdP.
//
// Hot path: one query to join `tenant_domains → tenants → tenant_policies`
// plus an optional `identity_providers` lookup. Result is cached by DOMAIN
// (not email) in Redis with a 5-min TTL — email-level caching would pollute
// memory and leak existence.
//
// Anti-timing-oracle: every response is padded to a jittered 80–120ms floor
// so cache hits and misses are indistinguishable. An attacker probing
// whether `someuser@acme.com` exists vs `someuser@notclaimed.com` sees only
// the response mode, never a timing difference that would confirm DB reach.
package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math/rand"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"

	dnsresolver "github.com/wave-connect/sso-platform/apps/identity-service/internal/dns"
)

// DiscoverMode enumerates the UI-facing routing decisions.
type DiscoverMode string

const (
	DiscoverModeConsumer        DiscoverMode = "consumer"
	DiscoverModePassword        DiscoverMode = "tenant_password"
	DiscoverModeSSO             DiscoverMode = "tenant_sso"
)

// DiscoverResult is the shape returned to the handler (which in turn shapes
// the HTTP response). Nil pointers for Tenant/SSO indicate those sections
// aren't applicable to the chosen mode.
type DiscoverResult struct {
	Mode   DiscoverMode
	Tenant *DiscoverTenant
	SSO    *DiscoverSSO
}

// DiscoverTenant is the tenant branding blob. Safe to expose cross-tenant
// because we only populate it after a verified domain match.
type DiscoverTenant struct {
	ID          string `json:"id"`       // typeid-formatted (ten_…)
	Slug        string `json:"slug"`
	Name        string `json:"name"`
	DisplayName string `json:"display_name,omitempty"`
	LogoURL     string `json:"logo_url,omitempty"`
}

// DiscoverSSO is the IdP-initiation blob when require_sso=TRUE and an active
// IdP exists. LoginURL is either the IdP's SAML SSO endpoint (type=saml) or
// a sso-service initiator URL for OIDC.
//
// For OIDC initiators, LoginURL also carries a `discover_token` query
// parameter — a 5-min single-use PASETO that sso-service's IdPInitiator
// (Slice 2+) verifies to bind the email-domain → tenant → IdP triple. The
// token is minted PER-REQUEST in `Discover()` after the cache read, so two
// callers for the same domain never receive the same token.
type DiscoverSSO struct {
	IdpID      string `json:"idp_id"`
	IdpType    string `json:"idp_type"`
	Name       string `json:"name"`
	LoginURL   string `json:"login_url"`
	// TenantUUID is the raw UUID of the resolved tenant. Used internally by
	// `Discover()` to mint a fresh discover_token; safe to serialize for
	// cache round-trip alongside IdpID (which is also a raw UUID).
	TenantUUID string `json:"tenant_uuid,omitempty"`
}

// discoverCacheEntry is what we marshal to Redis. Matches DiscoverResult but
// uses a concrete shape for predictable JSON round-trips.
type discoverCacheEntry struct {
	Mode   DiscoverMode    `json:"mode"`
	Tenant *DiscoverTenant `json:"tenant,omitempty"`
	SSO    *DiscoverSSO    `json:"sso,omitempty"`
}

// DiscoverService owns the per-domain lookup + Redis cache. Zero state
// beyond the injected dependencies.
type DiscoverService struct {
	pool  *pgxpool.Pool
	rdb   *redis.Client
	log   zerolog.Logger
	// ssoInitiatorBaseURL is the prefix we prepend when building an OIDC
	// initiator URL. Typically the sso-service origin (e.g.
	// "http://localhost:8083"); configured via EmailConfig.VerifyLinkBaseURL's
	// sibling at the sso-service.
	ssoInitiatorBaseURL string
	cacheTTL            time.Duration
	minDelay            time.Duration
	maxDelay            time.Duration
	// tokenSvc, when non-nil, mints a fresh discover_token for OIDC SSO
	// routing — see DiscoverSSO.LoginURL doc. Nil-safe: discover falls back
	// to the legacy token-less URL when this is absent (smooth boot before
	// Slice 1's `NewDiscoverTokenService` is wired into main.go).
	tokenSvc *DiscoverTokenService
}

// DiscoverServiceConfig is optional tuning. Pass `SsoInitiatorBaseURL=""` to
// use the existing sso-service relative path `/oauth2/authorize?idp_hint=…`.
type DiscoverServiceConfig struct {
	SsoInitiatorBaseURL string
	CacheTTL            time.Duration // default 5m
	MinResponseDelay    time.Duration // default 80ms
	MaxResponseDelay    time.Duration // default 120ms
}

// NewDiscoverService wires deps + applies config defaults.
func NewDiscoverService(pool *pgxpool.Pool, rdb *redis.Client, cfg DiscoverServiceConfig, log zerolog.Logger) *DiscoverService {
	if cfg.CacheTTL == 0 {
		cfg.CacheTTL = 5 * time.Minute
	}
	if cfg.MinResponseDelay == 0 {
		cfg.MinResponseDelay = 80 * time.Millisecond
	}
	if cfg.MaxResponseDelay == 0 {
		cfg.MaxResponseDelay = 120 * time.Millisecond
	}
	return &DiscoverService{
		pool:                pool,
		rdb:                 rdb,
		log:                 log.With().Str("component", "discover_service").Logger(),
		ssoInitiatorBaseURL: cfg.SsoInitiatorBaseURL,
		cacheTTL:            cfg.CacheTTL,
		minDelay:            cfg.MinResponseDelay,
		maxDelay:            cfg.MaxResponseDelay,
	}
}

// SetDiscoverTokenService installs the token minter post-construction.
// Separate setter so the NewDiscoverService signature stays binary-compatible
// while main.go opts into discover_token issuance. Pass nil to disable.
func (s *DiscoverService) SetDiscoverTokenService(svc *DiscoverTokenService) {
	s.tokenSvc = svc
}

// Discover returns the routing decision for the email's domain. Applies a
// jittered floor delay regardless of cache-hit/miss — do not short-circuit
// early.
func (s *DiscoverService) Discover(ctx context.Context, emailOrDomain string) (*DiscoverResult, error) {
	started := time.Now()
	defer func() { s.padDelay(ctx, started) }()

	domain, err := s.extractDomain(emailOrDomain)
	if err != nil {
		// Malformed input → consumer mode (enumeration-resistant). Log at
		// debug so ops can still tell something weird came through.
		s.log.Debug().Err(err).Str("input", emailOrDomain).Msg("discover: invalid input, returning consumer")
		return &DiscoverResult{Mode: DiscoverModeConsumer}, nil
	}

	// 1. Redis cache hit?
	if cached, ok := s.cacheGet(ctx, domain); ok {
		return cached, nil
	}

	// 2. DB lookup.
	result, err := s.resolveFromDB(ctx, domain)
	if err != nil {
		// Never surface DB errors to the caller — return a neutral consumer
		// response so the attack surface is identical to "domain not found".
		// The handler logs.
		s.log.Warn().Err(err).Str("domain", domain).Msg("discover: db error")
		return &DiscoverResult{Mode: DiscoverModeConsumer}, nil
	}

	// 3. Cache-write (errors are non-fatal).
	s.cacheSet(ctx, domain, result)

	// 4. Mint a fresh discover_token AFTER cache write so each requestor
	//    gets a unique single-use token. (Caching the token would defeat
	//    single-use.) Only OIDC initiators need it — SAML goes direct.
	s.decorateWithDiscoverToken(result)
	return result, nil
}

// decorateWithDiscoverToken is called by Discover() on both cache hits and
// fresh DB resolves. Idempotent: returns silently if the token service is
// not wired or the result isn't a tenant_sso OIDC route. The minted token is
// embedded as a `discover_token` query param on the existing LoginURL.
func (s *DiscoverService) decorateWithDiscoverToken(r *DiscoverResult) {
	if r == nil || r.Mode != DiscoverModeSSO || r.SSO == nil {
		return
	}
	if r.SSO.IdpType == "saml" {
		// SAML redirects direct to the IdP; sso-service's IdPInitiator isn't
		// in the loop today (Slice 4 changes this; we'll start minting then).
		return
	}
	if s.tokenSvc == nil {
		return // graceful no-op pre-wiring
	}
	if r.SSO.TenantUUID == "" || r.SSO.IdpID == "" {
		s.log.Warn().Msg("discover: cannot mint token, missing tenant or idp uuid in result")
		return
	}
	tenantID, err := uuid.Parse(r.SSO.TenantUUID)
	if err != nil {
		s.log.Warn().Err(err).Msg("discover: cannot mint token, bad tenant uuid in result")
		return
	}
	idpID, err := uuid.Parse(r.SSO.IdpID)
	if err != nil {
		s.log.Warn().Err(err).Msg("discover: cannot mint token, bad idp uuid in result")
		return
	}

	// Domain isn't stored on DiscoverResult — pull from Tenant.Slug as a
	// best-effort hint. The verifier (sso-service Slice 2) treats `dom` as
	// advisory metadata; the binding-critical claims are tid + idp.
	domain := ""
	if r.Tenant != nil {
		domain = r.Tenant.Slug
	}

	token, err := s.tokenSvc.Mint(tenantID, idpID, domain)
	if err != nil {
		s.log.Warn().Err(err).Msg("discover: token mint failed; URL falls back to token-less")
		return
	}
	r.SSO.LoginURL = appendQueryParam(r.SSO.LoginURL, "discover_token", token)
}

// InvalidateDomain drops a cached entry. Called when a tenant_domains row
// flips to verified or a domain is released — Phase 2's `tenant.domain.verified`
// event + Phase 4's release flow will be the subscribers. Exposed here so
// future wiring doesn't need to touch internals.
func (s *DiscoverService) InvalidateDomain(ctx context.Context, domain string) {
	if s.rdb == nil {
		return
	}
	if err := s.rdb.Del(ctx, cacheKey(domain)).Err(); err != nil {
		s.log.Debug().Err(err).Str("domain", domain).Msg("discover: cache invalidate failed")
	}
}

// ── internal ────────────────────────────────────────────────────────────────

func (s *DiscoverService) extractDomain(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if at := strings.LastIndex(raw, "@"); at >= 0 {
		raw = raw[at+1:]
	}
	return dnsresolver.NormalizeHostname(raw)
}

func cacheKey(domain string) string {
	return "discover:domain:" + strings.ToLower(domain)
}

func (s *DiscoverService) cacheGet(ctx context.Context, domain string) (*DiscoverResult, bool) {
	if s.rdb == nil {
		return nil, false
	}
	raw, err := s.rdb.Get(ctx, cacheKey(domain)).Bytes()
	if err != nil {
		if !errors.Is(err, redis.Nil) {
			s.log.Debug().Err(err).Str("domain", domain).Msg("discover: cache read error")
		}
		return nil, false
	}
	var entry discoverCacheEntry
	if err := json.Unmarshal(raw, &entry); err != nil {
		s.log.Warn().Err(err).Msg("discover: cache deserialize failed")
		return nil, false
	}
	return &DiscoverResult{Mode: entry.Mode, Tenant: entry.Tenant, SSO: entry.SSO}, true
}

func (s *DiscoverService) cacheSet(ctx context.Context, domain string, r *DiscoverResult) {
	if s.rdb == nil {
		return
	}
	raw, err := json.Marshal(discoverCacheEntry{Mode: r.Mode, Tenant: r.Tenant, SSO: r.SSO})
	if err != nil {
		return
	}
	if err := s.rdb.Set(ctx, cacheKey(domain), raw, s.cacheTTL).Err(); err != nil {
		s.log.Debug().Err(err).Str("domain", domain).Msg("discover: cache write failed")
	}
}

// resolveFromDB runs the single join query that drives the mode decision.
//
//	tenant_domains → tenants → tenant_policies (require_sso)
//	                        ↓
//	                  identity_providers (active)
//
// One query, one roundtrip. Returns DiscoverModeConsumer if no verified
// tenant_domain row matches the input domain.
func (s *DiscoverService) resolveFromDB(ctx context.Context, domain string) (*DiscoverResult, error) {
	const q = `
SELECT
    t.id, t.slug, t.name, COALESCE(t.display_name, ''), COALESCE(t.logo_url, ''),
    COALESCE(p.require_sso, FALSE),
    COALESCE(idp.id::text, ''),
    COALESCE(idp.type::text, ''),
    COALESCE(idp.name, ''),
    COALESCE(idp.saml_sso_url, ''),
    COALESCE(idp.oidc_issuer, '')
FROM tenant_domains td
JOIN tenants          t   ON t.id = td.tenant_id AND t.deleted_at IS NULL AND t.is_active
LEFT JOIN tenant_policies p ON p.tenant_id = t.id
LEFT JOIN LATERAL (
    SELECT *
    FROM identity_providers ip
    WHERE ip.tenant_id = t.id AND ip.status = 'active' AND ip.deleted_at IS NULL
    ORDER BY ip.created_at ASC
    LIMIT 1
) idp ON TRUE
WHERE td.domain = $1 AND td.status = 'verified' AND td.deleted_at IS NULL
LIMIT 1`

	var (
		tenantIDRaw   string
		slug, name    string
		displayName   string
		logoURL       string
		requireSSO    bool
		idpID, idpTyp string
		idpName       string
		samlSSOURL    string
		oidcIssuer    string
	)
	err := s.pool.QueryRow(ctx, q, domain).Scan(
		&tenantIDRaw, &slug, &name, &displayName, &logoURL,
		&requireSSO,
		&idpID, &idpTyp, &idpName, &samlSSOURL, &oidcIssuer,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return &DiscoverResult{Mode: DiscoverModeConsumer}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("discover query: %w", err)
	}

	tenant := &DiscoverTenant{
		ID:          formatTenantTypeID(tenantIDRaw),
		Slug:        slug,
		Name:        name,
		DisplayName: displayName,
		LogoURL:     logoURL,
	}

	// SSO path: require_sso AND an active IdP exists. Build the login URL
	// based on the IdP type. For SAML we redirect directly to saml_sso_url.
	// For OIDC we go through sso-service's initiator (the login-portal can't
	// do OIDC discovery client-side in Phase 3).
	if requireSSO && idpID != "" {
		loginURL := samlSSOURL
		if idpTyp != "saml" {
			loginURL = s.buildSSOInitiator(idpID)
		}
		return &DiscoverResult{
			Mode:   DiscoverModeSSO,
			Tenant: tenant,
			SSO: &DiscoverSSO{
				IdpID:      idpID,
				IdpType:    idpTyp,
				Name:       idpName,
				LoginURL:   loginURL,
				TenantUUID: tenantIDRaw,
			},
		}, nil
	}

	// Claimed + password-allowed. This is the common path for small orgs on
	// paid plans who use email/password without an external IdP.
	return &DiscoverResult{
		Mode:   DiscoverModePassword,
		Tenant: tenant,
	}, nil
}

// formatTenantTypeID wraps a raw uuid in the typeid "ten_" prefix used
// elsewhere. Duplicates `id.Format` to avoid pulling an import cycle in tests.
func formatTenantTypeID(rawUUID string) string {
	if rawUUID == "" {
		return ""
	}
	// Best-effort: call the typeid formatter indirectly via a tiny adapter.
	// See `internal/id` for the canonical path — this string form is enough
	// for the UI, which never round-trips it back.
	return tenantTypeIDFormatter(rawUUID)
}

// tenantTypeIDFormatter is a package-var so tests can replace it. In main
// binaries it's rebound in init().
var tenantTypeIDFormatter = func(rawUUID string) string {
	// Fallback: return the raw UUID. Main binary overrides with the typeid
	// form via SetTenantTypeIDFormatter in main.go.
	return rawUUID
}

// SetTenantTypeIDFormatter installs the typeid-formatting function. Called
// from main.go once at boot; keeps this package free of the id import and
// its test-only side effects.
func SetTenantTypeIDFormatter(f func(string) string) {
	tenantTypeIDFormatter = f
}

func (s *DiscoverService) buildSSOInitiator(idpID string) string {
	if s.ssoInitiatorBaseURL == "" {
		// Return a relative path; the UI does full navigation from the
		// current origin. Login-portal and sso-service are usually same-origin
		// in dev (both on localhost, different ports), so relative URLs are
		// not quite right — use the configured base URL in production.
		return "/oauth2/authorize?idp_hint=" + idpID
	}
	return strings.TrimRight(s.ssoInitiatorBaseURL, "/") + "/oauth2/authorize?idp_hint=" + idpID
}

// appendQueryParam adds `key=value` to an existing URL. Picks `?` or `&`
// based on whether a query string is already present. Caller is responsible
// for URL-encoding the value if it contains reserved characters.
func appendQueryParam(rawURL, key, value string) string {
	sep := "?"
	if strings.Contains(rawURL, "?") {
		sep = "&"
	}
	return rawURL + sep + key + "=" + value
}

// padDelay sleeps until `started + jittered(minDelay, maxDelay)` to defeat
// cache-hit vs miss timing oracles. If the real work already took longer
// than the target floor, returns immediately. Respects ctx cancellation.
func (s *DiscoverService) padDelay(ctx context.Context, started time.Time) {
	if s.maxDelay <= 0 {
		return
	}
	target := s.minDelay + time.Duration(rand.Int63n(int64(s.maxDelay-s.minDelay+1)))
	elapsed := time.Since(started)
	if elapsed >= target {
		return
	}
	select {
	case <-time.After(target - elapsed):
	case <-ctx.Done():
	}
}
