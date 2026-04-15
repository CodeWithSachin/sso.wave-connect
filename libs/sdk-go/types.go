package ssosdk

import "time"

// Config holds the SDK client configuration.
type Config struct {
	Domain       string // e.g. "sso.wave-connect.com" or "http://localhost:8083"
	ClientID     string
	ClientSecret string
	LocalKey     []byte // Optional: 32-byte symmetric key for v4.local decryption
}

// TokenClaims represents the decoded claims from a PASETO token.
type TokenClaims struct {
	Subject  string    `json:"sub"`
	TenantID string    `json:"tid"`
	Email    string    `json:"email"`
	Scopes   []string  `json:"scopes"`
	JTI      string    `json:"jti"`
	IssuedAt time.Time `json:"iat"`
	Expiry   time.Time `json:"exp"`
}

// IntrospectionResult represents the response from the token introspection endpoint.
type IntrospectionResult struct {
	Active   bool     `json:"active"`
	Sub      string   `json:"sub,omitempty"`
	TenantID string   `json:"tenant_id,omitempty"`
	Email    string   `json:"email,omitempty"`
	Scopes   []string `json:"scopes,omitempty"`
	Exp      int64    `json:"exp,omitempty"`
}

// CheckRequest represents a ReBAC permission check.
type CheckRequest struct {
	User     string `json:"user"`
	Relation string `json:"relation"`
	Object   string `json:"object"`
}

// CheckResponse represents the result of a permission check.
type CheckResponse struct {
	Allowed bool `json:"allowed"`
}

// ListObjectsRequest lists objects a user has a relation to.
type ListObjectsRequest struct {
	User     string `json:"user"`
	Relation string `json:"relation"`
	Type     string `json:"type"`
}

// ListObjectsResponse contains the objects.
type ListObjectsResponse struct {
	Objects []string `json:"objects"`
}
