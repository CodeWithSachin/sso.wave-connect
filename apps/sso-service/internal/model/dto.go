package model

// ErrorResponse is the uniform error envelope returned by every sso-service
// failure path. OAuth2 / OIDC error responses (RFC 6749 §5.2) use a
// different schema (`error`, `error_description`) — that's modelled
// separately as OAuthErrorResponse below.
type ErrorResponse struct {
	Error string `json:"error" example:"server_error"`
}

// OAuthErrorResponse matches RFC 6749 §5.2 — the wire format OAuth clients
// expect at /oauth2/token failures. Distinct from ErrorResponse so the spec
// renders the two error shapes clearly.
type OAuthErrorResponse struct {
	Error            string `json:"error" example:"invalid_grant"`
	ErrorDescription string `json:"error_description,omitempty"`
}

// OIDCDiscoveryDocument is the response body for /.well-known/openid-configuration.
// Only the fields wave-connect's IdP returns today; extend as new flows ship.
type OIDCDiscoveryDocument struct {
	Issuer                            string   `json:"issuer"`
	AuthorizationEndpoint             string   `json:"authorization_endpoint"`
	TokenEndpoint                     string   `json:"token_endpoint"`
	UserinfoEndpoint                  string   `json:"userinfo_endpoint"`
	JwksURI                           string   `json:"jwks_uri"`
	ResponseTypesSupported            []string `json:"response_types_supported"`
	SubjectTypesSupported             []string `json:"subject_types_supported"`
	IDTokenSigningAlgValuesSupported  []string `json:"id_token_signing_alg_values_supported"`
	ScopesSupported                   []string `json:"scopes_supported"`
	TokenEndpointAuthMethodsSupported []string `json:"token_endpoint_auth_methods_supported"`
}

// JWKSResponse is the response body for /.well-known/jwks.json. Each key is
// modelled as a free-form object because JWK shape varies by key type
// (EdDSA, RSA, EC) and Scalar 1.57+ renders nested objects fine.
type JWKSResponse struct {
	Keys []map[string]any `json:"keys"`
}

// UserInfoResponse is the OIDC UserInfo claims body.
type UserInfoResponse struct {
	Sub               string `json:"sub"`
	Email             string `json:"email,omitempty"`
	EmailVerified     bool   `json:"email_verified,omitempty"`
	Name              string `json:"name,omitempty"`
	PreferredUsername string `json:"preferred_username,omitempty"`
	Picture           string `json:"picture,omitempty"`
	TenantID          string `json:"tenant_id,omitempty"`
}
