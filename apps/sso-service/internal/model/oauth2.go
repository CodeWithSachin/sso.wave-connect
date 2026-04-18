package model

import (
	"time"

	"github.com/google/uuid"
)

// OAuthClient maps to the oauth_clients table.
type OAuthClient struct {
	ID                      uuid.UUID `json:"id"`
	TenantID                uuid.UUID `json:"tenant_id"`
	ClientID                string    `json:"client_id"`
	ClientSecretHash        *string   `json:"-"`
	Name                    string    `json:"name"`
	RedirectURIs            []string  `json:"redirect_uris"`
	PostLogoutRedirectURIs  []string  `json:"post_logout_redirect_uris"`
	AllowedGrantTypes       []string  `json:"allowed_grant_types"`
	AllowedScopes           []string  `json:"allowed_scopes"`
	TokenEndpointAuthMethod string    `json:"token_endpoint_auth_method"`
	AccessTokenTTLSeconds   int       `json:"access_token_ttl_seconds"`
	RefreshTokenTTLSeconds  int       `json:"refresh_token_ttl_seconds"`
	IDTokenTTLSeconds       int       `json:"id_token_ttl_seconds"`
	IsFirstParty            bool      `json:"is_first_party"`
	IsPublic                bool      `json:"is_public"`
	RequirePKCE             bool      `json:"require_pkce"`
	RequireConsent          bool      `json:"require_consent"`
	IsActive                bool      `json:"is_active"`
	Metadata                []byte    `json:"metadata"`
	CreatedAt               time.Time `json:"created_at"`
	UpdatedAt               time.Time `json:"updated_at"`
}

// UserConsent maps to the user_consents table.
type UserConsent struct {
	ID            uuid.UUID  `json:"id"`
	UserID        uuid.UUID  `json:"user_id"`
	ClientID      uuid.UUID  `json:"client_id"`
	TenantID      uuid.UUID  `json:"tenant_id"`
	GrantedScopes []string   `json:"granted_scopes"`
	Status        string     `json:"status"`
	GrantedAt     time.Time  `json:"granted_at"`
	RevokedAt     *time.Time `json:"revoked_at,omitempty"`
	ExpiresAt     *time.Time `json:"expires_at,omitempty"`
}

// AuthorizeRequest represents the incoming /oauth2/authorize parameters.
type AuthorizeRequest struct {
	ResponseType        string `query:"response_type" validate:"required,eq=code"`
	ClientID            string `query:"client_id" validate:"required"`
	RedirectURI         string `query:"redirect_uri" validate:"required,url"`
	Scope               string `query:"scope" validate:"required"`
	State               string `query:"state" validate:"required"`
	CodeChallenge       string `query:"code_challenge"`
	CodeChallengeMethod string `query:"code_challenge_method"`
	Nonce               string `query:"nonce"`
}

// TokenRequest represents the incoming /oauth2/token parameters.
type TokenRequest struct {
	GrantType    string `form:"grant_type" validate:"required"`
	Code         string `form:"code"`
	RedirectURI  string `form:"redirect_uri"`
	ClientID     string `form:"client_id"`
	ClientSecret string `form:"client_secret"`
	CodeVerifier string `form:"code_verifier"`
	RefreshToken string `form:"refresh_token"`
}

// AuthorizationCode is the payload encrypted inside a PASETO v4.local authorization code.
type AuthorizationCode struct {
	UserID              uuid.UUID `json:"sub"`
	ClientID            string    `json:"client_id"`
	TenantID            uuid.UUID `json:"tid"`
	RedirectURI         string    `json:"redirect_uri"`
	Scopes              []string  `json:"scopes"`
	Nonce               string    `json:"nonce"`
	CodeChallenge       string    `json:"code_challenge"`
	CodeChallengeMethod string    `json:"code_challenge_method"`
}

// TokenResponse is the JSON response from the /oauth2/token endpoint.
type TokenResponse struct {
	AccessToken  string `json:"access_token"`
	TokenType    string `json:"token_type"`
	ExpiresIn    int    `json:"expires_in"`
	RefreshToken string `json:"refresh_token,omitempty"`
	IDToken      string `json:"id_token,omitempty"`
	Scope        string `json:"scope,omitempty"`
}

// ConsentFormData is returned by GET /oauth2/consent for the consent UI.
type ConsentFormData struct {
	ClientName      string   `json:"client_name"`
	ClientID        string   `json:"client_id"`
	RequestedScopes []string `json:"requested_scopes"`
	RedirectURI     string   `json:"redirect_uri"`
	State           string   `json:"state"`
	// TenantID is the tenant the OAuth2 flow was pinned to at first
	// /authorize touch (Phase 5). The consent UI must echo this back in
	// the POST body so the code is minted for the same tenant, not the
	// session's current active_tenant_id (which may have drifted if the
	// user switched tenants mid-flow).
	TenantID string `json:"tenant_id,omitempty"`
}

// ConsentDecision is submitted by POST /oauth2/consent.
type ConsentDecision struct {
	Approved bool   `json:"approved" form:"approved"`
	State    string `json:"state" form:"state" validate:"required"`
}

// DiscoveryDocument is the OpenID Connect discovery document.
type DiscoveryDocument struct {
	Issuer                           string   `json:"issuer"`
	AuthorizationEndpoint            string   `json:"authorization_endpoint"`
	TokenEndpoint                    string   `json:"token_endpoint"`
	UserinfoEndpoint                 string   `json:"userinfo_endpoint"`
	JwksURI                          string   `json:"jwks_uri"`
	ResponseTypesSupported           []string `json:"response_types_supported"`
	SubjectTypesSupported            []string `json:"subject_types_supported"`
	IDTokenSigningAlgValuesSupported []string `json:"id_token_signing_alg_values_supported"`
	ScopesSupported                  []string `json:"scopes_supported"`
	TokenEndpointAuthMethodsSupported []string `json:"token_endpoint_auth_methods_supported"`
	GrantTypesSupported              []string `json:"grant_types_supported"`
	CodeChallengeMethodsSupported    []string `json:"code_challenge_methods_supported"`
}
