package model

// ErrorResponse is the uniform error envelope returned by every failure path
// in identity-service. Keeping this shape consistent lets the consoles render
// a single error toast/dialog component regardless of which endpoint failed.
type ErrorResponse struct {
	Error string `json:"error" example:"invalid request body"`
}

// AcceptedResponse is the body returned for fire-and-forget operations
// (e.g., resend verification email) — confirms the request was accepted
// without leaking whether the underlying record exists.
type AcceptedResponse struct {
	Status string `json:"status" example:"accepted"`
}

// EmptyOKResponse is the body returned by endpoints that succeed without
// data to return (logout, decline invitation, revoke token).
type EmptyOKResponse struct {
	Status string `json:"status" example:"ok"`
}

// --- Auth ---

// AuthResponse is the success body for /auth/register and /auth/login.
// The sso_session cookie carries the actual session token; the body carries
// the user + tenant context the SPA needs to render the post-login state
// without a follow-up roundtrip.
type AuthResponse struct {
	UserID      string `json:"user_id"`
	TenantID    string `json:"tenant_id"`
	Email       string `json:"email"`
	DisplayName string `json:"display_name,omitempty"`
	ExpiresAt   int64  `json:"expires_at"`
}

// MFA request DTOs already live in mfa.go (MfaVerifyRequest, MfaEnrollVerifyRequest).
// Annotations should reference those existing types; do not redeclare here.

// --- Signup ---

type VerifyEmailRequest struct {
	Token string `json:"token" validate:"required"`
}

type ResendVerificationRequest struct {
	Email string `json:"email" validate:"required,email"`
}

// --- Token ---

type RevokeTokenRequest struct {
	Token string `json:"token" validate:"required"`
}

// --- Active tenant ---

type SwitchTenantRequest struct {
	TenantID string `json:"tenant_id" validate:"required,uuid"`
}

// MembershipSummaryItem is one row in /auth/session/memberships.
type MembershipSummaryItem struct {
	TenantID     string `json:"tenant_id"`
	TenantName   string `json:"tenant_name"`
	Role         string `json:"role"`
	IsActive     bool   `json:"is_active"`
}

// ListMembershipsResponse is the body for /auth/session/memberships.
type ListMembershipsResponse struct {
	Memberships    []MembershipSummaryItem `json:"memberships"`
	ActiveTenantID string                  `json:"active_tenant_id"`
}

// RotateTokensResponse is the body for /auth/session/rotate.
type RotateTokensResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token,omitempty"`
	TokenType    string `json:"token_type" example:"Bearer"`
	ExpiresIn    int    `json:"expires_in"`
}

// SwitchTenantResponse is the body for /auth/session/active-tenant.
type SwitchTenantResponse struct {
	ActiveTenantID string `json:"active_tenant_id"`
}

// --- Invitation ---

type AcceptInvitationRequest struct {
	// Password is required only when the invited email has no existing user
	// account. The handler decides based on the bound user ID.
	Password string `json:"password,omitempty" validate:"omitempty,min=8"`
}

// --- Domain ---

type AddDomainRequest struct {
	Domain string `json:"domain" validate:"required,fqdn"`
}
