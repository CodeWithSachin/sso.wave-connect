package service

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"strings"
	"testing"
	"time"

	"aidanwoods.dev/go-paseto"
	"github.com/google/uuid"
	"github.com/rs/zerolog"

	"github.com/wave-connect/sso-platform/apps/sso-service/internal/config"
)

// newTestOIDCService builds an OIDCService against a freshly generated key
// pair. Use this in any unit test that needs a real signer/verifier —
// generating per-test keys keeps the tests deterministic without committing
// real secrets to the repo.
func newTestOIDCService(t *testing.T) *OIDCService {
	t.Helper()

	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("generate ed25519 key: %v", err)
	}
	_ = pub

	symBytes := make([]byte, 32)
	if _, err := rand.Read(symBytes); err != nil {
		t.Fatalf("generate symmetric key: %v", err)
	}

	cfg := config.TokenConfig{
		SymmetricKeyHex: hex.EncodeToString(symBytes),
		PrivateKeyHex:   hex.EncodeToString(priv),
		Issuer:          "https://sso.test",
		AccessTTL:       15 * time.Minute,
		RefreshTTL:      24 * time.Hour,
		IDTTL:           1 * time.Hour,
	}

	svc, err := NewOIDCService(cfg, zerolog.Nop())
	if err != nil {
		t.Fatalf("NewOIDCService: %v", err)
	}
	return svc
}

func TestBuildJWKS_Shape(t *testing.T) {
	svc := newTestOIDCService(t)

	jwks, err := svc.BuildJWKS()
	if err != nil {
		t.Fatalf("BuildJWKS: %v", err)
	}

	keys, ok := jwks["keys"].([]map[string]interface{})
	if !ok {
		t.Fatalf("jwks[\"keys\"] missing or wrong type: %T", jwks["keys"])
	}
	if len(keys) != 1 {
		t.Fatalf("expected exactly 1 key in JWKS, got %d", len(keys))
	}
	k := keys[0]

	if k["kty"] != "OKP" {
		t.Errorf("kty: want OKP, got %v", k["kty"])
	}
	if k["crv"] != "Ed25519" {
		t.Errorf("crv: want Ed25519, got %v", k["crv"])
	}
	if k["alg"] != "EdDSA" {
		t.Errorf("alg: want EdDSA, got %v", k["alg"])
	}
	if k["use"] != "sig" {
		t.Errorf("use: want sig, got %v", k["use"])
	}

	x, ok := k["x"].(string)
	if !ok || x == "" {
		t.Fatalf("x: missing or wrong type")
	}
	raw, err := base64.RawURLEncoding.DecodeString(x)
	if err != nil {
		t.Fatalf("x is not base64url: %v", err)
	}
	if len(raw) != 32 {
		t.Errorf("x decoded to %d bytes, want 32 (Ed25519 public key)", len(raw))
	}

	kid, ok := k["kid"].(string)
	if !ok || kid == "" {
		t.Fatalf("kid: missing")
	}
	// kid should be stable: a second call returns the same value.
	jwks2, _ := svc.BuildJWKS()
	keys2 := jwks2["keys"].([]map[string]interface{})
	if keys2[0]["kid"] != kid {
		t.Errorf("kid is not deterministic: %v vs %v", kid, keys2[0]["kid"])
	}
}

func TestBuildIDToken_PopulatesClaimsBasedOnScopes(t *testing.T) {
	svc := newTestOIDCService(t)

	userID := uuid.New()
	tenantID := uuid.New()
	cases := []struct {
		name       string
		scopes     []string
		email      string
		display    string
		picture    string
		wantEmail  string
		wantName   string
		wantPic    string
	}{
		{
			name:      "openid only — no profile/email claims",
			scopes:    []string{"openid"},
			email:     "alice@example.com",
			display:   "Alice",
			picture:   "https://example.com/a.png",
			wantEmail: "",
			wantName:  "",
			wantPic:   "",
		},
		{
			name:      "email scope populates email",
			scopes:    []string{"openid", "email"},
			email:     "alice@example.com",
			display:   "Alice",
			picture:   "https://example.com/a.png",
			wantEmail: "alice@example.com",
		},
		{
			name:     "profile scope populates name + picture",
			scopes:   []string{"openid", "profile"},
			email:    "alice@example.com",
			display:  "Alice",
			picture:  "https://example.com/a.png",
			wantName: "Alice",
			wantPic:  "https://example.com/a.png",
		},
		{
			name:      "profile+email populates all three",
			scopes:    []string{"openid", "profile", "email"},
			email:     "alice@example.com",
			display:   "Alice",
			picture:   "https://example.com/a.png",
			wantEmail: "alice@example.com",
			wantName:  "Alice",
			wantPic:   "https://example.com/a.png",
		},
		{
			name:      "empty input fields omitted even with scope granted",
			scopes:    []string{"openid", "profile", "email"},
			email:     "",
			display:   "",
			picture:   "",
			wantEmail: "",
			wantName:  "",
			wantPic:   "",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			tokenStr, err := svc.BuildIDToken(
				userID, tc.email, tc.display, tc.picture,
				tenantID, "client-test", tc.scopes, "test-nonce",
			)
			if err != nil {
				t.Fatalf("BuildIDToken: %v", err)
			}

			parser := paseto.NewParser()
			implicit := []byte(tenantID.String())
			parsed, err := parser.ParseV4Public(svc.verifyKey, tokenStr, implicit)
			if err != nil {
				t.Fatalf("ParseV4Public: %v", err)
			}

			var got string
			_ = parsed.Get("email", &got)
			if got != tc.wantEmail {
				t.Errorf("email: want %q, got %q", tc.wantEmail, got)
			}
			got = ""
			_ = parsed.Get("name", &got)
			if got != tc.wantName {
				t.Errorf("name: want %q, got %q", tc.wantName, got)
			}
			got = ""
			_ = parsed.Get("picture", &got)
			if got != tc.wantPic {
				t.Errorf("picture: want %q, got %q", tc.wantPic, got)
			}

			// Always-present claims
			sub, err := parsed.GetSubject()
			if err != nil || sub != userID.String() {
				t.Errorf("sub: want %s, got %q (err=%v)", userID, sub, err)
			}
		})
	}
}

func TestBuildIDToken_NonceOmittedWhenEmpty(t *testing.T) {
	svc := newTestOIDCService(t)
	userID := uuid.New()
	tenantID := uuid.New()

	// Empty nonce — common for refresh-token grants. Should not emit the
	// `nonce` claim at all (vs emitting an empty string).
	tokenStr, err := svc.BuildIDToken(
		userID, "", "", "", tenantID, "c", []string{"openid"}, "",
	)
	if err != nil {
		t.Fatalf("BuildIDToken: %v", err)
	}
	parser := paseto.NewParser()
	implicit := []byte(tenantID.String())
	parsed, err := parser.ParseV4Public(svc.verifyKey, tokenStr, implicit)
	if err != nil {
		t.Fatalf("ParseV4Public: %v", err)
	}
	var nonce string
	err = parsed.Get("nonce", &nonce)
	if err == nil {
		t.Errorf("expected `nonce` claim to be absent; got value=%q", nonce)
	}
}

func TestGetDiscoveryDocument_IncludesJWKSURI(t *testing.T) {
	doc := GetDiscoveryDocument("https://sso.test")
	jwksURI, ok := doc["jwks_uri"].(string)
	if !ok {
		t.Fatalf("jwks_uri missing from discovery doc")
	}
	if !strings.HasSuffix(jwksURI, "/.well-known/jwks.json") {
		t.Errorf("jwks_uri should end with /.well-known/jwks.json, got %q", jwksURI)
	}
	algs, _ := doc["id_token_signing_alg_values_supported"].([]string)
	found := false
	for _, a := range algs {
		if a == "EdDSA" {
			found = true
		}
	}
	if !found {
		t.Errorf("discovery doc missing EdDSA in id_token_signing_alg_values_supported: %v", algs)
	}
}
