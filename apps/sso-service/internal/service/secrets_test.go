package service

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"os"
	"strings"
	"testing"
)

// SecretsService is the cross-service complement to admin-api's AesGcmService
// (apps/admin-api/src/shared/crypto/aes-gcm.service.ts). These tests validate
// wire-format compatibility by encrypting with a hand-rolled implementation
// that matches the TypeScript service byte-for-byte, then decrypting via
// the Go service. If either side ever changes its wire format, this test
// fails first.

// encryptLikeAdminAPI mirrors the TypeScript AesGcmService.encrypt() exactly:
// 12-byte random IV, AES-256-GCM, output `v1:<base64url(iv)>:<base64url(ct||tag)>`.
func encryptLikeAdminAPI(t *testing.T, keyB64, plaintext string) string {
	t.Helper()
	rawKey, err := base64.StdEncoding.DecodeString(keyB64)
	if err != nil {
		t.Fatalf("decode key: %v", err)
	}
	if len(rawKey) != 32 {
		t.Fatalf("key must be 32 bytes, got %d", len(rawKey))
	}
	block, err := aes.NewCipher(rawKey)
	if err != nil {
		t.Fatalf("new cipher: %v", err)
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		t.Fatalf("new gcm: %v", err)
	}
	iv := make([]byte, aead.NonceSize())
	if _, err := rand.Read(iv); err != nil {
		t.Fatalf("read iv: %v", err)
	}
	ctAndTag := aead.Seal(nil, iv, []byte(plaintext), nil)
	return "v1:" + base64.RawURLEncoding.EncodeToString(iv) +
		":" + base64.RawURLEncoding.EncodeToString(ctAndTag)
}

func withSecretsService(t *testing.T) (*SecretsService, string) {
	t.Helper()
	keyBytes := make([]byte, 32)
	if _, err := rand.Read(keyBytes); err != nil {
		t.Fatalf("rand key: %v", err)
	}
	keyB64 := base64.StdEncoding.EncodeToString(keyBytes)
	original := os.Getenv("OIDC_SECRET_KEY")
	t.Setenv("OIDC_SECRET_KEY", keyB64)
	t.Cleanup(func() {
		if original == "" {
			_ = os.Unsetenv("OIDC_SECRET_KEY")
		} else {
			_ = os.Setenv("OIDC_SECRET_KEY", original)
		}
	})

	svc, err := NewSecretsService()
	if err != nil {
		t.Fatalf("NewSecretsService: %v", err)
	}
	return svc, keyB64
}

func TestSecretsService_RoundTripWithAdminAPIWireFormat(t *testing.T) {
	svc, keyB64 := withSecretsService(t)

	cases := []string{
		"super-secret-oidc-client-secret",
		"x", // single byte
		strings.Repeat("a", 4096), // long
		"🔐 unicode + symbols ✅",
	}
	for _, plaintext := range cases {
		t.Run(plaintext, func(t *testing.T) {
			ct := encryptLikeAdminAPI(t, keyB64, plaintext)
			got, err := svc.Decrypt(ct)
			if err != nil {
				t.Fatalf("Decrypt failed: %v", err)
			}
			if got != plaintext {
				t.Errorf("round-trip mismatch: want %q, got %q", plaintext, got)
			}
		})
	}
}

func TestSecretsService_TamperedCiphertextRejected(t *testing.T) {
	svc, keyB64 := withSecretsService(t)

	ct := encryptLikeAdminAPI(t, keyB64, "protected")
	parts := strings.Split(ct, ":")
	if len(parts) != 3 {
		t.Fatalf("invalid ct format")
	}
	// Flip one byte in the payload — should fail GCM auth tag.
	payload, _ := base64.RawURLEncoding.DecodeString(parts[2])
	payload[0] ^= 0x01
	parts[2] = base64.RawURLEncoding.EncodeToString(payload)
	tampered := strings.Join(parts, ":")

	if _, err := svc.Decrypt(tampered); err == nil {
		t.Fatal("expected tampered ciphertext to be rejected")
	}
}

func TestSecretsService_UnknownVersionRejected(t *testing.T) {
	svc, keyB64 := withSecretsService(t)
	ct := encryptLikeAdminAPI(t, keyB64, "x")
	tampered := strings.Replace(ct, "v1:", "v9:", 1)
	if _, err := svc.Decrypt(tampered); err == nil {
		t.Fatal("expected unknown version to be rejected")
	}
}

func TestSecretsService_RejectsMalformedTokens(t *testing.T) {
	svc, _ := withSecretsService(t)
	for _, bad := range []string{"", "plain", "v1:onlyonepart", "v1::"} {
		if _, err := svc.Decrypt(bad); err == nil {
			t.Errorf("expected error for malformed token %q", bad)
		}
	}
}

func TestSecretsService_IsEncrypted(t *testing.T) {
	svc, keyB64 := withSecretsService(t)
	ct := encryptLikeAdminAPI(t, keyB64, "x")
	if !svc.IsEncrypted(ct) {
		t.Error("expected v1:... to be detected as encrypted")
	}
	if svc.IsEncrypted("plaintext-value") {
		t.Error("plain string should not be detected as encrypted")
	}
	if svc.IsEncrypted("") {
		t.Error("empty string should not be detected as encrypted")
	}
}

func TestSecretsService_ConstructorRejectsMissingKey(t *testing.T) {
	original := os.Getenv("OIDC_SECRET_KEY")
	_ = os.Unsetenv("OIDC_SECRET_KEY")
	t.Cleanup(func() { _ = os.Setenv("OIDC_SECRET_KEY", original) })

	if _, err := NewSecretsService(); err == nil {
		t.Fatal("expected error when OIDC_SECRET_KEY is unset")
	}
}

func TestSecretsService_ConstructorRejectsWrongLengthKey(t *testing.T) {
	original := os.Getenv("OIDC_SECRET_KEY")
	shortKey := make([]byte, 16) // 128-bit, wrong for AES-256
	rand.Read(shortKey)
	t.Setenv("OIDC_SECRET_KEY", base64.StdEncoding.EncodeToString(shortKey))
	t.Cleanup(func() { _ = os.Setenv("OIDC_SECRET_KEY", original) })

	if _, err := NewSecretsService(); err == nil {
		t.Fatal("expected error for wrong-length key")
	}
}
