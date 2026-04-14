package service

import (
	"fmt"
	"time"

	"aidanwoods.dev/go-paseto"
	"github.com/google/uuid"
	"github.com/rs/zerolog"

	"github.com/wave-connect/sso-platform/apps/sso-service/internal/config"
)

// UserInfo holds the user claims needed for ID tokens and the userinfo endpoint.
type UserInfo struct {
	Sub         string `json:"sub"`
	Email       string `json:"email,omitempty"`
	Name        string `json:"name,omitempty"`
	Picture     string `json:"picture,omitempty"`
	TenantID    string `json:"tid,omitempty"`
}

type OIDCService struct {
	cfg        config.TokenConfig
	signingKey paseto.V4AsymmetricSecretKey
	verifyKey  paseto.V4AsymmetricPublicKey
	symKey     paseto.V4SymmetricKey
	log        zerolog.Logger
}

func NewOIDCService(cfg config.TokenConfig, log zerolog.Logger) (*OIDCService, error) {
	symKey, err := paseto.V4SymmetricKeyFromHex(cfg.SymmetricKeyHex)
	if err != nil {
		return nil, fmt.Errorf("parse symmetric key: %w", err)
	}

	privKey, err := cfg.Ed25519PrivateKey()
	if err != nil {
		return nil, fmt.Errorf("load private key: %w", err)
	}

	sk, err := paseto.NewV4AsymmetricSecretKeyFromEd25519(privKey)
	if err != nil {
		return nil, fmt.Errorf("build paseto signing key: %w", err)
	}

	return &OIDCService{
		cfg:        cfg,
		signingKey: sk,
		verifyKey:  sk.Public(),
		symKey:     symKey,
		log:        log.With().Str("component", "oidc_service").Logger(),
	}, nil
}

// BuildIDToken creates a PASETO v4.public signed ID token.
func (s *OIDCService) BuildIDToken(
	userID uuid.UUID,
	email string,
	displayName string,
	tenantID uuid.UUID,
	clientID string,
	scopes []string,
	nonce string,
) (string, error) {
	now := time.Now().UTC()

	token := paseto.NewToken()
	token.SetSubject(userID.String())
	token.SetIssuedAt(now)
	token.SetExpiration(now.Add(s.cfg.IDTTL))
	token.SetIssuer(s.cfg.Issuer)
	token.SetJti(uuid.New().String())
	token.Set("tid", tenantID.String())
	token.Set("aud", clientID)
	token.Set("nonce", nonce)

	// Add claims based on scopes
	for _, scope := range scopes {
		switch scope {
		case "email":
			token.Set("email", email)
		case "profile":
			token.Set("name", displayName)
		}
	}

	implicit := []byte(tenantID.String())
	return token.V4Sign(s.signingKey, implicit), nil
}

// BuildAccessToken creates a PASETO v4.local encrypted access token.
func (s *OIDCService) BuildAccessToken(
	userID uuid.UUID,
	email string,
	tenantID uuid.UUID,
	clientID string,
	scopes []string,
) (string, int, error) {
	now := time.Now().UTC()

	token := paseto.NewToken()
	token.SetSubject(userID.String())
	token.SetIssuedAt(now)
	token.SetExpiration(now.Add(s.cfg.AccessTTL))
	token.SetIssuer(s.cfg.Issuer)
	token.SetJti(uuid.New().String())
	token.Set("tid", tenantID.String())
	token.Set("aud", clientID)
	token.Set("email", email)
	token.Set("scopes", scopes)

	implicit := []byte(tenantID.String())
	tokenStr := token.V4Encrypt(s.symKey, implicit)

	return tokenStr, int(s.cfg.AccessTTL.Seconds()), nil
}

// BuildRefreshToken creates a PASETO v4.local encrypted refresh token.
func (s *OIDCService) BuildRefreshToken(
	userID uuid.UUID,
	tenantID uuid.UUID,
	clientID string,
	scopes []string,
) (string, error) {
	now := time.Now().UTC()

	token := paseto.NewToken()
	token.SetSubject(userID.String())
	token.SetIssuedAt(now)
	token.SetExpiration(now.Add(s.cfg.RefreshTTL))
	token.SetIssuer(s.cfg.Issuer)
	token.SetJti(uuid.New().String())
	token.Set("type", "refresh")
	token.Set("tid", tenantID.String())
	token.Set("aud", clientID)
	token.Set("scopes", scopes)

	implicit := []byte(tenantID.String())
	return token.V4Encrypt(s.symKey, implicit), nil
}

// BuildUserInfo returns filtered user claims based on granted scopes.
func (s *OIDCService) BuildUserInfo(
	userID uuid.UUID,
	email string,
	displayName string,
	picture string,
	tenantID uuid.UUID,
	scopes []string,
) *UserInfo {
	info := &UserInfo{
		Sub: userID.String(),
	}

	for _, scope := range scopes {
		switch scope {
		case "email":
			info.Email = email
		case "profile":
			info.Name = displayName
			info.Picture = picture
		}
	}

	return info
}

// DecryptAccessToken decrypts and validates a v4.local access token.
func (s *OIDCService) DecryptAccessToken(tokenStr string, tenantID uuid.UUID) (*paseto.Token, error) {
	parser := paseto.NewParser()
	parser.AddRule(paseto.NotExpired())
	parser.AddRule(paseto.IssuedBy(s.cfg.Issuer))

	implicit := []byte(tenantID.String())
	token, err := parser.ParseV4Local(s.symKey, tokenStr, implicit)
	if err != nil {
		return nil, fmt.Errorf("invalid access token: %w", err)
	}
	return token, nil
}

// GetDiscoveryDocument returns the OpenID Connect discovery document.
func GetDiscoveryDocument(issuer string) map[string]interface{} {
	return map[string]interface{}{
		"issuer":                                issuer,
		"authorization_endpoint":                issuer + "/oauth2/authorize",
		"token_endpoint":                        issuer + "/oauth2/token",
		"userinfo_endpoint":                     issuer + "/userinfo",
		"response_types_supported":              []string{"code"},
		"subject_types_supported":               []string{"public"},
		"id_token_signing_alg_values_supported": []string{"EdDSA"},
		"scopes_supported":                      []string{"openid", "profile", "email"},
		"token_endpoint_auth_methods_supported": []string{"client_secret_basic", "client_secret_post", "none"},
		"grant_types_supported":                 []string{"authorization_code", "refresh_token"},
		"code_challenge_methods_supported":      []string{"S256"},
		"claims_supported":                      []string{"sub", "iss", "aud", "exp", "iat", "nonce", "email", "name"},
	}
}

// PublicKeyHex returns the hex-encoded public verification key.
func (s *OIDCService) PublicKeyHex() string {
	return s.verifyKey.ExportHex()
}
