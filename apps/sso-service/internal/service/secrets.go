package service

import (
	"crypto/aes"
	"crypto/cipher"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"strings"
)

// SecretsService decrypts column-level ciphertexts written by admin-api's
// AesGcmService. Wire-compatible counterpart to
// apps/admin-api/src/shared/crypto/aes-gcm.service.ts — both services must
// share the SAME `OIDC_SECRET_KEY` value (see Track 0 / Track 6 ops notes;
// in K8s, both Deployments reference the same Secret).
//
// Wire format: `v1:<base64url(iv)>:<base64url(ciphertext || authTag)>`.
//
// Slice 2 uses this to decrypt `identity_providers.oidc_client_secret_enc`
// before passing the plaintext to `golang.org/x/oauth2`. Slice 4 will reuse
// it for SAML keypair material if we ever decide to encrypt those.
type SecretsService struct {
	keyVersions map[string]cipher.AEAD
	current     string
}

// NewSecretsService loads the AES-GCM key from `OIDC_SECRET_KEY` (same env
// var admin-api reads). Returns an error rather than silently degrading —
// sso-service cannot complete an OIDC federation without decrypting the
// IdP's client secret, so a missing key is a hard boot failure.
//
// Supports versioned key rotation per Track 6.1: read `OIDC_SECRET_KEY_V2`
// if set, register both v1 and v2 keys in the map, and use the highest
// version for new writes. (sso-service only decrypts today; the writer is
// admin-api. Both services need to recognize the same set of versions.)
func NewSecretsService() (*SecretsService, error) {
	v1Key := os.Getenv("OIDC_SECRET_KEY")
	if v1Key == "" {
		return nil, errors.New("OIDC_SECRET_KEY env var is required for SecretsService (must match admin-api's value)")
	}
	aead, err := buildAEAD(v1Key, "v1")
	if err != nil {
		return nil, err
	}
	s := &SecretsService{
		keyVersions: map[string]cipher.AEAD{"v1": aead},
		current:     "v1",
	}

	// Optional v2 for rotation transitions.
	if v2Key := os.Getenv("OIDC_SECRET_KEY_V2"); v2Key != "" {
		v2, err := buildAEAD(v2Key, "v2")
		if err != nil {
			return nil, err
		}
		s.keyVersions["v2"] = v2
		s.current = "v2"
	}
	return s, nil
}

func buildAEAD(rawBase64, label string) (cipher.AEAD, error) {
	raw, err := base64.StdEncoding.DecodeString(rawBase64)
	if err != nil {
		return nil, fmt.Errorf("%s key not valid base64: %w", label, err)
	}
	if len(raw) != 32 {
		return nil, fmt.Errorf("%s key must decode to 32 bytes, got %d", label, len(raw))
	}
	block, err := aes.NewCipher(raw)
	if err != nil {
		return nil, fmt.Errorf("build %s AES cipher: %w", label, err)
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("build %s GCM: %w", label, err)
	}
	return aead, nil
}

// Decrypt parses the wire format and returns the plaintext. Errors are
// intentionally opaque to the caller — internal logs carry the specific
// reason. Returning structured errors here would create a tamper-oracle
// for an attacker who can probe stored ciphertexts.
func (s *SecretsService) Decrypt(token string) (string, error) {
	parts := strings.Split(token, ":")
	if len(parts) != 3 {
		return "", fmt.Errorf("decrypt: invalid token format")
	}
	version, ivB64, payloadB64 := parts[0], parts[1], parts[2]

	aead, ok := s.keyVersions[version]
	if !ok {
		return "", fmt.Errorf("decrypt: unsupported version %q", version)
	}

	iv, err := base64.RawURLEncoding.DecodeString(ivB64)
	if err != nil {
		return "", fmt.Errorf("decrypt: bad iv encoding")
	}
	if len(iv) != aead.NonceSize() {
		return "", fmt.Errorf("decrypt: iv length mismatch")
	}
	payload, err := base64.RawURLEncoding.DecodeString(payloadB64)
	if err != nil {
		return "", fmt.Errorf("decrypt: bad payload encoding")
	}

	plaintext, err := aead.Open(nil, iv, payload, nil)
	if err != nil {
		// GCM Open() failure means the ciphertext was tampered with OR
		// we're using the wrong key. Both surface as a generic error.
		return "", fmt.Errorf("decrypt: authentication failed")
	}
	return string(plaintext), nil
}

// IsEncrypted is a cheap prefix test mirroring admin-api's helper. Lets
// callers reject obviously-plaintext input (e.g., from a misconfigured
// admin-console retry that round-tripped a sanitized record).
func (s *SecretsService) IsEncrypted(value string) bool {
	if value == "" {
		return false
	}
	for version := range s.keyVersions {
		if strings.HasPrefix(value, version+":") {
			return true
		}
	}
	return false
}

// Unused helper retained for symmetry with the TypeScript AES-GCM service.
// Hex decoding is not used in the wire format; left for future migrations
// from hex-encoded legacy ciphertexts if any are discovered.
var _ = hex.DecodeString
