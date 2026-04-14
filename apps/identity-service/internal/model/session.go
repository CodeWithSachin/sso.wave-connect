package model

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"time"

	"github.com/google/uuid"
)

type Session struct {
	ID             uuid.UUID  `json:"id"`
	UserID         uuid.UUID  `json:"user_id"`
	TenantID       uuid.UUID  `json:"tenant_id"`
	TokenHash      string     `json:"token_hash"`
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

// GenerateTokenHash creates a random token and returns its SHA-256 hash.
func GenerateTokenHash() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	h := sha256.Sum256(b)
	return hex.EncodeToString(h[:]), nil
}
