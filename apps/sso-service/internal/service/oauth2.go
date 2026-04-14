package service

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
	"time"

	"aidanwoods.dev/go-paseto"
	"github.com/google/uuid"
	"github.com/rs/zerolog"

	"github.com/wave-connect/sso-platform/apps/sso-service/internal/config"
	"github.com/wave-connect/sso-platform/apps/sso-service/internal/model"
	"github.com/wave-connect/sso-platform/apps/sso-service/internal/repository"
)

var (
	ErrInvalidCode     = errors.New("invalid authorization code")
	ErrCodeExpired     = errors.New("authorization code expired")
	ErrPKCEFailed      = errors.New("PKCE verification failed")
	ErrClientMismatch  = errors.New("client_id mismatch")
	ErrRedirectMismatch = errors.New("redirect_uri mismatch")
	ErrUnsupportedMethod = errors.New("unsupported code_challenge_method")
)

type OAuth2Service struct {
	cfg       config.TokenConfig
	symKey    paseto.V4SymmetricKey
	clientRepo *repository.OAuthClientRepository
	log       zerolog.Logger
}

func NewOAuth2Service(
	cfg config.TokenConfig,
	clientRepo *repository.OAuthClientRepository,
	log zerolog.Logger,
) (*OAuth2Service, error) {
	symKey, err := paseto.V4SymmetricKeyFromHex(cfg.SymmetricKeyHex)
	if err != nil {
		return nil, fmt.Errorf("parse symmetric key: %w", err)
	}

	return &OAuth2Service{
		cfg:       cfg,
		symKey:    symKey,
		clientRepo: clientRepo,
		log:       log.With().Str("component", "oauth2_service").Logger(),
	}, nil
}

// CreateAuthorizationCode creates a PASETO v4.local token that acts as an authorization code.
// The code is self-contained: all data needed for exchange is encrypted inside.
func (s *OAuth2Service) CreateAuthorizationCode(
	userID uuid.UUID,
	clientID string,
	tenantID uuid.UUID,
	redirectURI string,
	scopes []string,
	nonce string,
	codeChallenge string,
	codeChallengeMethod string,
) (string, error) {
	now := time.Now().UTC()

	token := paseto.NewToken()
	token.SetSubject(userID.String())
	token.SetIssuedAt(now)
	token.SetExpiration(now.Add(5 * time.Minute))
	token.SetIssuer(s.cfg.Issuer)
	token.SetJti(uuid.New().String())
	token.Set("type", "authorization_code")
	token.Set("client_id", clientID)
	token.Set("tid", tenantID.String())
	token.Set("redirect_uri", redirectURI)
	token.Set("scopes", scopes)
	token.Set("nonce", nonce)
	token.Set("code_challenge", codeChallenge)
	token.Set("code_challenge_method", codeChallengeMethod)

	return token.V4Encrypt(s.symKey, nil), nil
}

// ExchangeCode decrypts a PASETO authorization code and validates all fields.
func (s *OAuth2Service) ExchangeCode(
	code string,
	clientID string,
	redirectURI string,
	codeVerifier string,
) (*model.AuthorizationCode, error) {
	parser := paseto.NewParser()
	parser.AddRule(paseto.NotExpired())
	parser.AddRule(paseto.IssuedBy(s.cfg.Issuer))

	token, err := parser.ParseV4Local(s.symKey, code, nil)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalidCode, err)
	}

	// Verify this is an authorization code
	var tokenType string
	if err := token.Get("type", &tokenType); err != nil || tokenType != "authorization_code" {
		return nil, ErrInvalidCode
	}

	// Extract all claims
	sub, err := token.GetSubject()
	if err != nil {
		return nil, ErrInvalidCode
	}
	userID, err := uuid.Parse(sub)
	if err != nil {
		return nil, ErrInvalidCode
	}

	var codeClientID string
	if err := token.Get("client_id", &codeClientID); err != nil {
		return nil, ErrInvalidCode
	}

	var tenantIDStr string
	if err := token.Get("tid", &tenantIDStr); err != nil {
		return nil, ErrInvalidCode
	}
	tenantID, err := uuid.Parse(tenantIDStr)
	if err != nil {
		return nil, ErrInvalidCode
	}

	var codeRedirectURI string
	if err := token.Get("redirect_uri", &codeRedirectURI); err != nil {
		return nil, ErrInvalidCode
	}

	var scopes []string
	_ = token.Get("scopes", &scopes)

	var nonce string
	_ = token.Get("nonce", &nonce)

	var codeChallenge string
	_ = token.Get("code_challenge", &codeChallenge)

	var codeChallengeMethod string
	_ = token.Get("code_challenge_method", &codeChallengeMethod)

	// Validate client_id matches
	if codeClientID != clientID {
		return nil, ErrClientMismatch
	}

	// Validate redirect_uri matches
	if codeRedirectURI != redirectURI {
		return nil, ErrRedirectMismatch
	}

	// Validate PKCE if code_challenge was provided
	if codeChallenge != "" {
		if !ValidatePKCE(codeVerifier, codeChallenge, codeChallengeMethod) {
			return nil, ErrPKCEFailed
		}
	}

	return &model.AuthorizationCode{
		UserID:              userID,
		ClientID:            codeClientID,
		TenantID:            tenantID,
		RedirectURI:         codeRedirectURI,
		Scopes:              scopes,
		Nonce:               nonce,
		CodeChallenge:       codeChallenge,
		CodeChallengeMethod: codeChallengeMethod,
	}, nil
}

// ValidatePKCE verifies the PKCE code_verifier against the stored code_challenge using S256.
func ValidatePKCE(codeVerifier, codeChallenge, method string) bool {
	if method != "S256" {
		return false // Only S256 supported
	}
	h := sha256.Sum256([]byte(codeVerifier))
	computed := base64.RawURLEncoding.EncodeToString(h[:])
	return subtle.ConstantTimeCompare([]byte(computed), []byte(codeChallenge)) == 1
}

// ValidateRedirectURI checks if the given redirect_uri is in the client's allowed list.
func ValidateRedirectURI(redirectURI string, allowedURIs []string) bool {
	for _, allowed := range allowedURIs {
		if redirectURI == allowed {
			return true
		}
	}
	return false
}

// ValidateScopes checks if all requested scopes are allowed by the client.
func ValidateScopes(requestedScopes string, allowedScopes []string) ([]string, bool) {
	requested := strings.Fields(requestedScopes)
	if len(requested) == 0 {
		return allowedScopes, true // Default to all allowed scopes
	}

	allowedSet := make(map[string]struct{}, len(allowedScopes))
	for _, s := range allowedScopes {
		allowedSet[s] = struct{}{}
	}

	for _, s := range requested {
		if _, ok := allowedSet[s]; !ok {
			return nil, false
		}
	}
	return requested, true
}

// ContainsGrantType checks if a grant type is in the allowed list.
func ContainsGrantType(grantType string, allowed []string) bool {
	for _, g := range allowed {
		if g == grantType {
			return true
		}
	}
	return false
}
