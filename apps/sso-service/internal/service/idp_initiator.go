package service

import (
	"context"
	"errors"
	"fmt"
)

// IdPInitiator is the abstract entry point for routing an `/oauth2/authorize`
// request to an external IdP (Entra, Google, Okta, generic SAML/OIDC). The
// concrete implementations land in Milestone A Slice 2 (OIDC RP) and Slice 4
// (SAML SP); Slice 1 ships only this interface plus a stub that returns 501
// so existing password tenants keep working unchanged.
//
// Design note: this is an interface, not a struct, so the OAuth2 handler can
// be wired against the stub today and against the real SAML/OIDC services
// tomorrow without further plumbing changes.
type IdPInitiator interface {
	// Initiate redirects the user to the external IdP. `discoverToken` is the
	// signed PASETO from `/auth/public/discover` that proves the email-domain
	// → tenant → IdP binding; empty when the request arrived without going
	// through discover (deep-link from corporate App Tiles). Returns
	// ErrIdPNotImplemented while Slices 2 & 4 are pending.
	Initiate(ctx context.Context, req InitiateRequest) (InitiateResult, error)
}

// InitiateRequest carries the inputs the SAML/OIDC implementations will need.
// Keep the shape stable so the OAuth2 handler doesn't change when Slice 2/4
// ship.
type InitiateRequest struct {
	IdPID          string
	DiscoverToken  string
	OAuthState     string
	RedirectURI    string
	ClientID       string
	Scopes         []string
	CodeChallenge  string
	CodeChallengeM string // S256 only
	Nonce          string
	UserAgent      string
	ClientIP       string
}

// InitiateResult tells the handler what to do next. For OIDC + SAML
// SP-initiated, this is a 302 to the IdP's authorize endpoint. For the
// interstitial-confirm case (Slice 3), the implementation returns the
// interstitial URL.
type InitiateResult struct {
	RedirectURL string
}

// ErrIdPNotImplemented signals that the configured IdP type's runtime is
// not yet shipped. The handler maps this to a 501 with a stable error body.
var ErrIdPNotImplemented = errors.New("external IdP runtime not implemented")

// NewStubIdPInitiator returns an IdPInitiator that refuses every request
// with ErrIdPNotImplemented. Used today; replaced in Slices 2 & 4 with
// concrete OIDC and SAML implementations.
//
// The stub exists so the OAuth2 handler can wire `idp_hint` parameter
// parsing now — the moment Slice 2's `ExternalOIDCInitiator` lands, we
// swap the constructor in main.go and the handler code remains untouched.
func NewStubIdPInitiator() IdPInitiator {
	return &stubInitiator{}
}

type stubInitiator struct{}

func (s *stubInitiator) Initiate(_ context.Context, req InitiateRequest) (InitiateResult, error) {
	return InitiateResult{}, fmt.Errorf("%w: idp_id=%s", ErrIdPNotImplemented, req.IdPID)
}
