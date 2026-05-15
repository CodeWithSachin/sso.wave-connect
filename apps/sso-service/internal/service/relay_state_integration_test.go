//go:build integration

// Integration tests for RelayStateStore. Requires local Redis. Skips
// gracefully if Redis is unreachable. Run with:
//   go test -tags=integration ./internal/service/...
package service

import (
	"context"
	"errors"
	"os"
	"testing"

	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"
)

func openRedis(t *testing.T) (*redis.Client, context.Context) {
	t.Helper()
	addr := os.Getenv("REDIS_ADDR")
	if addr == "" {
		addr = "localhost:6379"
	}
	ctx := context.Background()
	rdb := redis.NewClient(&redis.Options{Addr: addr})
	if err := rdb.Ping(ctx).Err(); err != nil {
		t.Skipf("Redis unreachable at %s: %v", addr, err)
	}
	t.Cleanup(func() { _ = rdb.Close() })
	return rdb, ctx
}

func TestRelayState_RoundTrip(t *testing.T) {
	rdb, ctx := openRedis(t)
	store := NewRelayStateStore(rdb, zerolog.Nop())

	original := RelayState{
		TenantID:            "t-123",
		IdPID:               "idp-456",
		OAuthState:          "oauth-state-789",
		RedirectURI:         "https://app.example.com/callback",
		ClientID:            "miles-lms",
		CodeChallenge:       "challenge",
		CodeChallengeMethod: "S256",
		Scopes:              []string{"openid", "email", "profile"},
		ReturnTo:            "pkce:verifier-bytes",
	}

	id, err := store.Issue(ctx, original)
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}
	if id == "" {
		t.Fatal("Issue returned empty id")
	}

	consumed, err := store.Consume(ctx, id)
	if err != nil {
		t.Fatalf("Consume: %v", err)
	}
	if consumed.TenantID != original.TenantID ||
		consumed.IdPID != original.IdPID ||
		consumed.OAuthState != original.OAuthState ||
		consumed.RedirectURI != original.RedirectURI ||
		consumed.ClientID != original.ClientID ||
		consumed.CodeChallenge != original.CodeChallenge ||
		consumed.ReturnTo != original.ReturnTo {
		t.Errorf("round-trip mismatch:\n  want: %+v\n  got:  %+v", original, *consumed)
	}
	if len(consumed.Scopes) != len(original.Scopes) {
		t.Errorf("scopes length: want %d, got %d", len(original.Scopes), len(consumed.Scopes))
	}
}

func TestRelayState_SingleUseEnforcement(t *testing.T) {
	rdb, ctx := openRedis(t)
	store := NewRelayStateStore(rdb, zerolog.Nop())

	id, err := store.Issue(ctx, RelayState{TenantID: "t", IdPID: "idp"})
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}
	if _, err := store.Consume(ctx, id); err != nil {
		t.Fatalf("first Consume: %v", err)
	}
	_, err = store.Consume(ctx, id)
	if !errors.Is(err, ErrRelayStateNotFound) {
		t.Fatalf("second Consume should return ErrRelayStateNotFound, got: %v", err)
	}
}

func TestRelayState_ConsumeUnknownID(t *testing.T) {
	rdb, ctx := openRedis(t)
	store := NewRelayStateStore(rdb, zerolog.Nop())

	// 43-char base64url string that's not a real key.
	_, err := store.Consume(ctx, "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")
	if !errors.Is(err, ErrRelayStateNotFound) {
		t.Fatalf("expected ErrRelayStateNotFound, got: %v", err)
	}
}

func TestRelayState_RejectsMalformedID(t *testing.T) {
	rdb, ctx := openRedis(t)
	store := NewRelayStateStore(rdb, zerolog.Nop())

	for _, bad := range []string{"", "tooshort", "has invalid chars!", "way-too-long-" + string(make([]byte, 100))} {
		_, err := store.Consume(ctx, bad)
		if !errors.Is(err, ErrRelayStateNotFound) {
			t.Errorf("malformed id %q: expected ErrRelayStateNotFound, got %v", bad, err)
		}
	}
}
