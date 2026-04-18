package model

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"time"

	"github.com/google/uuid"
)

type Session struct {
	ID uuid.UUID `json:"id"`
	// UserID is who owns the session.
	UserID uuid.UUID `json:"user_id"`
	// TenantID is the anchor — the tenant this session was minted for at
	// login. Never mutates; used for audit trails and forensic queries.
	TenantID uuid.UUID `json:"tenant_id"`
	// ActiveTenantID is the live tenant context — the tenant the session is
	// currently acting on behalf of. Starts equal to TenantID; flipped by
	// PATCH /auth/session/active-tenant when the user switches between orgs
	// they belong to. All RLS-sensitive reads should scope on this, not on
	// TenantID (Phase 5 switcher).
	ActiveTenantID uuid.UUID  `json:"active_tenant_id"`
	TokenHash      string     `json:"token_hash"`
	RawToken       string     `json:"-"` // Transient: only set at creation time for SSO cookie
	Status         string     `json:"status"`
	IPAddress      string     `json:"ip_address"`
	UserAgent      string     `json:"user_agent"`
	LastActivityAt time.Time  `json:"last_activity_at"`
	ExpiresAt      time.Time  `json:"expires_at"`
	RevokedAt      *time.Time `json:"revoked_at,omitempty"`
	RevokeReason   string     `json:"revoke_reason,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
}

type SessionDTO struct {
	ID             string     `json:"id"`
	IPAddress      string     `json:"ip_address"`
	UserAgent      string     `json:"user_agent"`
	LastActivityAt time.Time  `json:"last_activity_at"`
	CreatedAt      time.Time  `json:"created_at"`
	ExpiresAt      time.Time  `json:"expires_at"`
	RevokedAt      *time.Time `json:"revoked_at,omitempty"`
	Current        bool       `json:"current"`
}

// GenerateSessionToken creates a random 32-byte token and returns both
// the raw base64url-encoded value (for the SSO cookie) and the SHA-256 hex
// hash (for DB storage). The raw token is never persisted.
func GenerateSessionToken() (raw string, hash string, err error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", "", err
	}
	raw = base64.RawURLEncoding.EncodeToString(b)
	h := sha256.Sum256(b)
	hash = hex.EncodeToString(h[:])
	return raw, hash, nil
}

// HashRawToken takes a base64url-encoded raw token (from the SSO cookie)
// and returns the SHA-256 hex hash for DB lookup. Used by sso-service.
func HashRawToken(rawToken string) (string, error) {
	b, err := base64.RawURLEncoding.DecodeString(rawToken)
	if err != nil {
		return "", err
	}
	h := sha256.Sum256(b)
	return hex.EncodeToString(h[:]), nil
}
