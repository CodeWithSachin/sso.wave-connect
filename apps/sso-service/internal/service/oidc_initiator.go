package service

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"fmt"

	"github.com/google/uuid"
	"github.com/rs/zerolog"
)

// OIDCIdPInitiator is the real (non-stub) implementation of IdPInitiator
// for OIDC IdPs — replaces NewStubIdPInitiator once Slice 2 is wired in.
//
// Flow:
//  1. Generate a fresh PKCE verifier (43-128 chars per RFC 7636).
//  2. Issue a RelayState in Redis carrying the original /oauth2/authorize
//     context + the PKCE verifier (so we can replay both at callback).
//  3. Build the IdP's authorize URL with `state=<relay_id>` and the PKCE
//     challenge.
//  4. Return that URL for the handler to 302 to.
//
// SAML gets its own initiator in Slice 4 — same interface, different
// state-carry format (RelayState form field, not `state` query param).
type OIDCIdPInitiator struct {
	oidc       *ExternalOIDCService
	relay      *RelayStateStore
	log        zerolog.Logger
}

func NewOIDCIdPInitiator(oidc *ExternalOIDCService, relay *RelayStateStore, log zerolog.Logger) *OIDCIdPInitiator {
	return &OIDCIdPInitiator{
		oidc:  oidc,
		relay: relay,
		log:   log.With().Str("component", "oidc_initiator").Logger(),
	}
}

// Initiate satisfies IdPInitiator. Returns InitiateResult with the IdP's
// authorize URL on success. Errors propagate to the handler which renders
// a typed error page (Slice 3) or, for now, returns a 500.
func (o *OIDCIdPInitiator) Initiate(ctx context.Context, req InitiateRequest) (InitiateResult, error) {
	idpID, err := uuid.Parse(req.IdPID)
	if err != nil {
		return InitiateResult{}, fmt.Errorf("invalid idp_id: %w", err)
	}

	// PKCE verifier: 32 bytes raw → 43-char base64url. Within the 43-128
	// range RFC 7636 mandates.
	verifierBytes := make([]byte, 32)
	if _, err := rand.Read(verifierBytes); err != nil {
		return InitiateResult{}, fmt.Errorf("generate pkce verifier: %w", err)
	}
	verifier := base64.RawURLEncoding.EncodeToString(verifierBytes)

	// Resolve the IdP early so we can stamp the tenant id on the RelayState
	// — the post-callback flow uses this for the three-way (URL idp_id =
	// RelayState idp_id = federated_identities row's idp_id) bind check.
	relay := RelayState{
		IdPID:               req.IdPID,
		Nonce:               req.Nonce,
		OAuthState:          req.OAuthState,
		RedirectURI:         req.RedirectURI,
		ClientID:            req.ClientID,
		CodeChallenge:       req.CodeChallenge,
		CodeChallengeMethod: req.CodeChallengeM,
		Scopes:              req.Scopes,
	}

	// Stash the PKCE verifier separately so the JSON shape stays close to
	// the documented schema (this field exists in the struct as `nonce` /
	// `oauth_state` etc.; for the verifier we piggyback on the unused
	// `return_to` field, with a `pkce:` prefix to be explicit at consume time).
	relay.ReturnTo = "pkce:" + verifier

	// Bind to the IdP's tenant for the cross-check at callback.
	if cached, err := o.oidc.peek(ctx, idpID); err == nil {
		relay.TenantID = cached.idp.TenantID.String()
	}

	state, err := o.relay.Issue(ctx, relay)
	if err != nil {
		return InitiateResult{}, fmt.Errorf("issue relay state: %w", err)
	}

	authURL, err := o.oidc.AuthCodeURL(ctx, idpID, state, verifier)
	if err != nil {
		return InitiateResult{}, fmt.Errorf("build authorize url: %w", err)
	}
	o.log.Info().
		Str("idp_id", req.IdPID).
		Str("state", state).
		Msg("external OIDC initiate")
	return InitiateResult{RedirectURL: authURL}, nil
}

// peek is a tiny accessor on ExternalOIDCService that returns the cached
// IdP config without going through Auth/Exchange. Used here to bind the
// tenant id into RelayState at issue time.
func (s *ExternalOIDCService) peek(ctx context.Context, idpID uuid.UUID) (*cachedIdP, error) {
	return s.load(ctx, idpID)
}
