package model

import (
	"time"

	"github.com/google/uuid"
)

type MfaEnrollment struct {
	ID              uuid.UUID  `json:"id"`
	UserID          uuid.UUID  `json:"user_id"`
	Method          string     `json:"method"`
	Status          string     `json:"status"`
	SecretEncrypted string     `json:"-"`
	CredentialID    string     `json:"credential_id,omitempty"`
	PublicKey       string     `json:"public_key,omitempty"`
	SignCount       int64      `json:"sign_count,omitempty"`
	Transports      []string   `json:"transports,omitempty"`
	PhoneNumber     string     `json:"phone_number,omitempty"`
	IsDefault       bool       `json:"is_default"`
	LastUsedAt      *time.Time `json:"last_used_at,omitempty"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
}

type MfaBackupCode struct {
	ID        int64      `json:"id"`
	UserID    uuid.UUID  `json:"user_id"`
	CodeHash  string     `json:"-"`
	UsedAt    *time.Time `json:"used_at,omitempty"`
	CreatedAt time.Time  `json:"created_at"`
}

type MfaEnrollRequest struct {
	Method string `json:"method" validate:"required,oneof=totp webauthn"`
}

type MfaVerifyRequest struct {
	Code           string `json:"code" validate:"required,min=6,max=4096"`
	ChallengeToken string `json:"challenge_token" validate:"required"`
	Method         string `json:"method,omitempty"`
}

type MfaEnrollVerifyRequest struct {
	Code string `json:"code" validate:"required,len=6"`
}

// WebAuthn request/response types

type WebAuthnBeginRegisterResponse struct {
	Options      interface{} `json:"options"`
	EnrollmentID string      `json:"enrollment_id"`
}

type WebAuthnCompleteRegisterRequest struct {
	EnrollmentID string      `json:"enrollment_id" validate:"required"`
	Credential   interface{} `json:"credential" validate:"required"`
}

type WebAuthnBeginLoginResponse struct {
	Options interface{} `json:"options"`
}

type WebAuthnCompleteLoginRequest struct {
	Credential     interface{} `json:"credential" validate:"required"`
	ChallengeToken string      `json:"challenge_token" validate:"required"`
}

type BackupCodeRegenerateResponse struct {
	BackupCodes []string `json:"backup_codes"`
	Count       int      `json:"count"`
}

type MfaEnrollResponse struct {
	SecretURI    string   `json:"secret_uri"`
	BackupCodes  []string `json:"backup_codes"`
	EnrollmentID string   `json:"enrollment_id"`
}

type MfaChallengeResponse struct {
	MfaRequired    bool     `json:"mfa_required"`
	ChallengeToken string   `json:"challenge_token"`
	AllowedMethods []string `json:"allowed_methods"`
}

type MfaEnrollmentDTO struct {
	ID        string     `json:"id"`
	Method    string     `json:"method"`
	Status    string     `json:"status"`
	IsDefault bool       `json:"is_default"`
	LastUsedAt *time.Time `json:"last_used_at,omitempty"`
	CreatedAt time.Time  `json:"created_at"`
}
