package model

import (
	"time"

	"github.com/google/uuid"
)

type TokenClaims struct {
	Subject  uuid.UUID `json:"sub"`
	TenantID uuid.UUID `json:"tid"`
	Email    string    `json:"email"`
	Scopes   []string  `json:"scopes"`
	JTI      string    `json:"jti"`
	IssuedAt time.Time `json:"iat"`
	Expiry   time.Time `json:"exp"`
}

type TokenSet struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	IDToken      string `json:"id_token"`
	ExpiresIn    int    `json:"expires_in"`
	TokenType    string `json:"token_type"`
}

type RefreshTokenFamily struct {
	FamilyID      string    `json:"family_id"`
	UserID        uuid.UUID `json:"user_id"`
	TenantID      uuid.UUID `json:"tenant_id"`
	ClientID      uuid.UUID `json:"client_id"`
	CurrentJTI    string    `json:"current_jti"`
	Generation    int       `json:"generation"`
	IsRevoked     bool      `json:"is_revoked"`
	RevokedReason string    `json:"revoked_reason,omitempty"`
	CreatedAt     time.Time `json:"created_at"`
	LastRotatedAt time.Time `json:"last_rotated_at"`
	ExpiresAt     time.Time `json:"expires_at"`
}

type TokenDenyEntry struct {
	JTI       string    `json:"jti"`
	ExpiresAt time.Time `json:"expires_at"`
	Reason    string    `json:"reason"`
	CreatedAt time.Time `json:"created_at"`
}

type RefreshRequest struct {
	GrantType    string `json:"grant_type" validate:"required,eq=refresh_token"`
	RefreshToken string `json:"refresh_token" validate:"required"`
}

type RevokeRequest struct {
	Token string `json:"token" validate:"required"`
}
