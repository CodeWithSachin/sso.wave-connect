package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"aidanwoods.dev/go-paseto"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"

	"github.com/wave-connect/sso-platform/apps/identity-service/internal/config"
)

// DiscoverTokenTTL is the lifetime of a discover_token from mint to expiry.
// 5 minutes is the same envelope as RelayState (Slice 2) and is comfortably
// long enough for a user to complete the redirect chain to sso-service,
// short enough to bound the abuse window if a token leaks.
const DiscoverTokenTTL = 5 * time.Minute

// DiscoverTokenIssuer is the fixed `iss` claim. sso-service (Slice 2)
// enforces this so a generic access/refresh token cannot be presented as
// a discover_token.
const DiscoverTokenIssuer = "wave-connect.identity-service/discover"

var (
	// ErrDiscoverTokenInvalid is returned for malformed, mis-signed, or
	// expired tokens. Treat as "user must restart at /auth/public/discover".
	ErrDiscoverTokenInvalid = errors.New("discover_token invalid")

	// ErrDiscoverTokenConsumed is returned when the jti was already used.
	// Single-use enforcement defeats replay of a leaked token.
	ErrDiscoverTokenConsumed = errors.New("discover_token already consumed")
)

// DiscoverTokenClaims is the verified payload sso-service consumes when an
// `/oauth2/authorize?discover_token=...` request arrives. Slice 2's
// IdPInitiator uses these to validate the (tenant, idp, domain) triple
// matches the request and to satisfy the three-layer idp_hint defense.
type DiscoverTokenClaims struct {
	TenantID uuid.UUID
	IdPID    uuid.UUID
	Domain   string
	JTI      string
}

// DiscoverTokenService mints + verifies the short-lived signed bridge
// tokens that pass discover's domain→tenant→IdP binding through the user's
// browser to sso-service. The token is PASETO v4.local (symmetric key shared
// between identity-service and sso-service via config) — both services'
// `token.symmetric_key_hex` must match, same coordination as access tokens.
//
// Why v4.local + single-use Redis SETNX, not v4.public:
//   - v4.local is symmetric, so it does not require sso-service to fetch
//     identity-service's JWKS (a strict dependency that would complicate
//     boot ordering). Both services already share the symmetric key for
//     PASETO access tokens; we reuse the same envelope.
//   - Single-use SETNX on the jti is the only credible defense against
//     a stolen token. The signature alone doesn't help — anyone who
//     intercepts the URL has the bytes.
//   - Server-side state is bounded: one Redis key per discover hit, 5 min
//     TTL, negligible memory.
type DiscoverTokenService struct {
	symKey paseto.V4SymmetricKey
	rdb    *redis.Client
	log    zerolog.Logger
}

// NewDiscoverTokenService builds the service from the same TokenConfig
// used elsewhere — the symmetric key MUST be identical to sso-service's
// or verification fails. Track 0's `OIDC_SECRET_KEY` is a separate concern
// (column encryption); the discover-token key is `token.symmetric_key_hex`.
func NewDiscoverTokenService(cfg config.TokenConfig, rdb *redis.Client, log zerolog.Logger) (*DiscoverTokenService, error) {
	symBytes, err := hexDecode(cfg.SymmetricKeyHex)
	if err != nil {
		return nil, fmt.Errorf("decode symmetric key: %w", err)
	}
	if len(symBytes) != 32 {
		return nil, fmt.Errorf("symmetric key must be 32 bytes, got %d", len(symBytes))
	}
	symKey, err := paseto.V4SymmetricKeyFromBytes(symBytes)
	if err != nil {
		return nil, fmt.Errorf("build paseto symmetric key: %w", err)
	}
	return &DiscoverTokenService{
		symKey: symKey,
		rdb:    rdb,
		log:    log.With().Str("component", "discover_token").Logger(),
	}, nil
}

// Mint produces a new discover_token for the (tenant, idp, domain) triple.
// Each token has a fresh random jti so two discoveries for the same user
// don't collide on consumption.
func (s *DiscoverTokenService) Mint(tenantID, idpID uuid.UUID, domain string) (string, error) {
	now := time.Now().UTC()

	token := paseto.NewToken()
	token.SetIssuer(DiscoverTokenIssuer)
	token.SetIssuedAt(now)
	token.SetNotBefore(now)
	token.SetExpiration(now.Add(DiscoverTokenTTL))
	token.SetJti(uuid.New().String())
	token.Set("tid", tenantID.String())
	token.Set("idp", idpID.String())
	token.Set("dom", domain)

	// implicit: bind to the tenant — any modification to the tenant claim
	// then fails verification, defense-in-depth against a confused-deputy
	// attempt that swaps the body but not the implicit assertion.
	implicit := []byte(tenantID.String())
	return token.V4Encrypt(s.symKey, implicit), nil
}

// Verify decrypts and validates the token, then consumes its jti via Redis
// SETNX so a second presentation fails with ErrDiscoverTokenConsumed.
//
// The caller is expected to already know `expectedTenantID` (e.g., resolved
// from the IdP id in the URL path); the implicit assertion is computed from
// it, so a mismatch surfaces as a generic ErrDiscoverTokenInvalid (no oracle
// distinguishing "wrong tenant" from "bad signature").
func (s *DiscoverTokenService) Verify(ctx context.Context, raw string, expectedTenantID uuid.UUID) (*DiscoverTokenClaims, error) {
	parser := paseto.NewParser()
	parser.AddRule(paseto.NotExpired())
	parser.AddRule(paseto.IssuedBy(DiscoverTokenIssuer))

	implicit := []byte(expectedTenantID.String())
	parsed, err := parser.ParseV4Local(s.symKey, raw, implicit)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrDiscoverTokenInvalid, err)
	}

	var tidStr, idpStr, dom string
	if err := parsed.Get("tid", &tidStr); err != nil {
		return nil, fmt.Errorf("%w: missing tid", ErrDiscoverTokenInvalid)
	}
	if err := parsed.Get("idp", &idpStr); err != nil {
		return nil, fmt.Errorf("%w: missing idp", ErrDiscoverTokenInvalid)
	}
	if err := parsed.Get("dom", &dom); err != nil {
		return nil, fmt.Errorf("%w: missing dom", ErrDiscoverTokenInvalid)
	}

	tenantID, err := uuid.Parse(tidStr)
	if err != nil || tenantID != expectedTenantID {
		return nil, fmt.Errorf("%w: tenant mismatch", ErrDiscoverTokenInvalid)
	}
	idpID, err := uuid.Parse(idpStr)
	if err != nil {
		return nil, fmt.Errorf("%w: bad idp uuid", ErrDiscoverTokenInvalid)
	}
	jti, err := parsed.GetJti()
	if err != nil {
		return nil, fmt.Errorf("%w: missing jti", ErrDiscoverTokenInvalid)
	}

	// Single-use enforcement. SETNX returns true only if the key was not
	// already set; redis.Bool comparison handles the race-free atomic test
	// for free.
	consumed, setErr := s.rdb.SetNX(ctx, redisKeyForJTI(jti), "1", DiscoverTokenTTL).Result()
	if setErr != nil {
		s.log.Warn().Err(setErr).Str("jti", jti).Msg("redis SETNX failed for discover_token; failing closed")
		return nil, fmt.Errorf("%w: replay-protection store unavailable", ErrDiscoverTokenInvalid)
	}
	if !consumed {
		return nil, ErrDiscoverTokenConsumed
	}

	return &DiscoverTokenClaims{
		TenantID: tenantID,
		IdPID:    idpID,
		Domain:   dom,
		JTI:      jti,
	}, nil
}

func redisKeyForJTI(jti string) string {
	return "discover_token:" + jti
}
