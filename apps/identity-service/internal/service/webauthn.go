package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"

	"github.com/wave-connect/sso-platform/apps/identity-service/internal/model"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/repository"
)

const webauthnSessionTTL = 5 * time.Minute

// WebAuthnConfig holds configuration for the WebAuthn service.
type WebAuthnConfig struct {
	RPID          string `mapstructure:"rp_id"`
	RPDisplayName string `mapstructure:"rp_display_name"`
	RPOrigin      string `mapstructure:"rp_origin"`
}

// WebAuthnService handles FIDO2/WebAuthn registration and login flows.
type WebAuthnService struct {
	wan     *webauthn.WebAuthn
	mfaRepo *repository.MfaRepository
	rdb     *redis.Client
	log     zerolog.Logger
}

// WebAuthnUser adapts our model.User to the webauthn.User interface.
type WebAuthnUser struct {
	id          []byte
	name        string
	displayName string
	credentials []webauthn.Credential
}

func (u *WebAuthnUser) WebAuthnID() []byte                         { return u.id }
func (u *WebAuthnUser) WebAuthnName() string                       { return u.name }
func (u *WebAuthnUser) WebAuthnDisplayName() string                { return u.displayName }
func (u *WebAuthnUser) WebAuthnCredentials() []webauthn.Credential { return u.credentials }
func (u *WebAuthnUser) WebAuthnIcon() string                       { return "" }

func NewWebAuthnService(
	cfg WebAuthnConfig,
	mfaRepo *repository.MfaRepository,
	rdb *redis.Client,
	log zerolog.Logger,
) (*WebAuthnService, error) {
	wan, err := webauthn.New(&webauthn.Config{
		RPDisplayName: cfg.RPDisplayName,
		RPID:          cfg.RPID,
		RPOrigins:     []string{cfg.RPOrigin},
		Timeouts: webauthn.TimeoutsConfig{
			Registration: webauthn.TimeoutConfig{
				Enforce: true,
				Timeout: webauthnSessionTTL,
			},
			Login: webauthn.TimeoutConfig{
				Enforce: true,
				Timeout: webauthnSessionTTL,
			},
		},
	})
	if err != nil {
		return nil, fmt.Errorf("create webauthn: %w", err)
	}
	return &WebAuthnService{
		wan:     wan,
		mfaRepo: mfaRepo,
		rdb:     rdb,
		log:     log.With().Str("component", "webauthn_service").Logger(),
	}, nil
}

// BeginRegistration starts a WebAuthn registration ceremony.
func (s *WebAuthnService) BeginRegistration(ctx context.Context, user *model.User) (*protocol.CredentialCreation, string, error) {
	wanUser := s.toWebAuthnUser(ctx, user)

	options, session, err := s.wan.BeginRegistration(wanUser,
		webauthn.WithResidentKeyRequirement(protocol.ResidentKeyRequirementPreferred),
	)
	if err != nil {
		return nil, "", fmt.Errorf("begin registration: %w", err)
	}

	enrollmentID := uuid.New().String()

	// Store session in Redis
	sessionData, _ := json.Marshal(session)
	key := fmt.Sprintf("webauthn_reg:%s:%s", user.ID.String(), enrollmentID)
	s.rdb.Set(ctx, key, sessionData, webauthnSessionTTL)

	return options, enrollmentID, nil
}

// CompleteRegistration finishes a WebAuthn registration ceremony and stores the credential.
func (s *WebAuthnService) CompleteRegistration(
	ctx context.Context,
	user *model.User,
	enrollmentID string,
	credentialJSON []byte,
) (*model.MfaEnrollment, error) {
	// Retrieve session from Redis
	key := fmt.Sprintf("webauthn_reg:%s:%s", user.ID.String(), enrollmentID)
	sessionData, err := s.rdb.Get(ctx, key).Bytes()
	if err != nil {
		return nil, fmt.Errorf("registration session expired or not found")
	}
	s.rdb.Del(ctx, key)

	var session webauthn.SessionData
	if err := json.Unmarshal(sessionData, &session); err != nil {
		return nil, fmt.Errorf("unmarshal session: %w", err)
	}

	wanUser := s.toWebAuthnUser(ctx, user)

	// Parse the credential from the client
	parsedResponse, err := protocol.ParseCredentialCreationResponseBody(bytes.NewReader(credentialJSON))
	if err != nil {
		return nil, fmt.Errorf("parse credential response: %w", err)
	}

	credential, err := s.wan.CreateCredential(wanUser, session, parsedResponse)
	if err != nil {
		return nil, fmt.Errorf("create credential: %w", err)
	}

	// Serialize credential data
	credID := fmt.Sprintf("%x", credential.ID)
	pubKey, _ := json.Marshal(credential.PublicKey)
	transports := make([]string, len(credential.Transport))
	for i, t := range credential.Transport {
		transports[i] = string(t)
	}

	now := time.Now().UTC()
	enrollment := &model.MfaEnrollment{
		ID:           uuid.New(),
		UserID:       user.ID,
		Method:       "webauthn",
		Status:       "active",
		CredentialID: credID,
		PublicKey:    string(pubKey),
		SignCount:    int64(credential.Authenticator.SignCount),
		Transports:   transports,
		IsDefault:    false,
		CreatedAt:    now,
		UpdatedAt:    now,
	}

	if err := s.mfaRepo.CreateWebAuthnEnrollment(ctx, enrollment); err != nil {
		return nil, fmt.Errorf("store webauthn enrollment: %w", err)
	}

	s.log.Info().
		Str("user_id", user.ID.String()).
		Str("credential_id", credID).
		Msg("WebAuthn credential registered")

	return enrollment, nil
}

// BeginLogin starts a WebAuthn login ceremony.
func (s *WebAuthnService) BeginLogin(ctx context.Context, user *model.User) (*protocol.CredentialAssertion, error) {
	wanUser := s.toWebAuthnUser(ctx, user)

	if len(wanUser.credentials) == 0 {
		return nil, fmt.Errorf("no WebAuthn credentials registered")
	}

	options, session, err := s.wan.BeginLogin(wanUser)
	if err != nil {
		return nil, fmt.Errorf("begin login: %w", err)
	}

	sessionData, _ := json.Marshal(session)
	key := fmt.Sprintf("webauthn_login:%s", user.ID.String())
	s.rdb.Set(ctx, key, sessionData, webauthnSessionTTL)

	return options, nil
}

// CompleteLogin finishes a WebAuthn login ceremony and verifies the assertion.
func (s *WebAuthnService) CompleteLogin(
	ctx context.Context,
	user *model.User,
	assertionJSON []byte,
) error {
	key := fmt.Sprintf("webauthn_login:%s", user.ID.String())
	sessionData, err := s.rdb.Get(ctx, key).Bytes()
	if err != nil {
		return fmt.Errorf("login session expired or not found")
	}
	s.rdb.Del(ctx, key)

	var session webauthn.SessionData
	if err := json.Unmarshal(sessionData, &session); err != nil {
		return fmt.Errorf("unmarshal session: %w", err)
	}

	wanUser := s.toWebAuthnUser(ctx, user)

	parsedResponse, err := protocol.ParseCredentialRequestResponseBody(bytes.NewReader(assertionJSON))
	if err != nil {
		return fmt.Errorf("parse assertion response: %w", err)
	}

	credential, err := s.wan.ValidateLogin(wanUser, session, parsedResponse)
	if err != nil {
		return fmt.Errorf("validate login: %w", err)
	}

	// Update sign count for the matched credential
	credID := fmt.Sprintf("%x", credential.ID)
	enrollments, _ := s.mfaRepo.GetWebAuthnEnrollments(ctx, user.ID)
	for _, e := range enrollments {
		if e.CredentialID == credID {
			_ = s.mfaRepo.UpdateSignCount(ctx, e.ID, int64(credential.Authenticator.SignCount))
			break
		}
	}

	s.log.Info().
		Str("user_id", user.ID.String()).
		Str("credential_id", credID).
		Msg("WebAuthn login successful")

	return nil
}

// toWebAuthnUser converts a model.User to a WebAuthnUser with existing credentials loaded.
func (s *WebAuthnService) toWebAuthnUser(ctx context.Context, user *model.User) *WebAuthnUser {
	wanUser := &WebAuthnUser{
		id:          user.ID[:],
		name:        user.Email,
		displayName: user.DisplayName,
	}

	enrollments, err := s.mfaRepo.GetWebAuthnEnrollments(ctx, user.ID)
	if err != nil {
		s.log.Warn().Err(err).Msg("failed to load webauthn credentials")
		return wanUser
	}

	for _, e := range enrollments {
		credID := []byte(e.CredentialID)
		var pubKey []byte
		_ = json.Unmarshal([]byte(e.PublicKey), &pubKey)
		transports := make([]protocol.AuthenticatorTransport, len(e.Transports))
		for i, t := range e.Transports {
			transports[i] = protocol.AuthenticatorTransport(t)
		}

		wanUser.credentials = append(wanUser.credentials, webauthn.Credential{
			ID:        credID,
			PublicKey: pubKey,
			Transport: transports,
			Authenticator: webauthn.Authenticator{
				SignCount: uint32(e.SignCount),
			},
		})
	}

	return wanUser
}
