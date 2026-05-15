package service

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"
)

// RelayStateTTL bounds the elapsed time between authorize → external-IdP
// → callback. 5 minutes is the same envelope as discover_token and matches
// SAML RelayState norms; longer would allow stale flows to land after the
// user gave up.
const RelayStateTTL = 5 * time.Minute

// ErrRelayStateNotFound covers expired, never-existed, or already-consumed
// state IDs — all surface as a generic error to the IdP-callback handler,
// which renders a typed error page.
var ErrRelayStateNotFound = errors.New("relay state not found or consumed")

// RelayState carries the full /oauth2/authorize replay context across the
// cross-origin round trip to the external IdP. The state lives in Redis
// keyed by an opaque ID so the user's browser can lose all cookies (privacy
// modes, third-party-cookie blocking) and we can still reconstruct the
// originating tenant + OAuth flow when the IdP POSTs back.
//
// Reused for both OIDC (passed as the `state` query parameter) and SAML
// (passed as the RelayState form field).
type RelayState struct {
	TenantID            string   `json:"tenant_id"`
	IdPID               string   `json:"idp_id"`
	Nonce               string   `json:"nonce,omitempty"`
	OAuthState          string   `json:"oauth_state"`
	RedirectURI         string   `json:"redirect_uri"`
	ClientID            string   `json:"client_id"`
	CodeChallenge       string   `json:"code_challenge,omitempty"`
	CodeChallengeMethod string   `json:"code_challenge_method,omitempty"`
	Scopes              []string `json:"scopes,omitempty"`
	ReturnTo            string   `json:"return_to,omitempty"`
	CreatedAt           int64    `json:"created_at"`
}

// RelayStateStore is the Redis-backed single-use store. Keys are namespaced
// `relaystate:<id>` so an `KEYS` scan never leaks them into log dumps next
// to other Redis state.
type RelayStateStore struct {
	rdb *redis.Client
	log zerolog.Logger
}

func NewRelayStateStore(rdb *redis.Client, log zerolog.Logger) *RelayStateStore {
	return &RelayStateStore{
		rdb: rdb,
		log: log.With().Str("component", "relay_state").Logger(),
	}
}

// Issue generates a fresh opaque ID, stores the state under it, and returns
// the ID for embedding in the OAuth `state` (or SAML RelayState) value.
//
// The ID is 32 raw bytes of crypto/rand base64url-encoded (43 chars without
// padding). That's well under the ~80-char practical RelayState limit for
// even the strictest IdPs (ADFS) and gives us 256 bits of randomness so
// guessing is not a credible attack.
func (s *RelayStateStore) Issue(ctx context.Context, rs RelayState) (string, error) {
	idBytes := make([]byte, 32)
	if _, err := rand.Read(idBytes); err != nil {
		return "", fmt.Errorf("generate relay state id: %w", err)
	}
	id := base64.RawURLEncoding.EncodeToString(idBytes)

	rs.CreatedAt = time.Now().UTC().Unix()
	payload, err := json.Marshal(rs)
	if err != nil {
		return "", fmt.Errorf("marshal relay state: %w", err)
	}

	// SETNX-equivalent (SET with NX) is unnecessary because the ID has
	// 256 bits of entropy — a collision is effectively impossible. Plain
	// SET with EX keeps the code path simple.
	if err := s.rdb.Set(ctx, keyFor(id), payload, RelayStateTTL).Err(); err != nil {
		return "", fmt.Errorf("write relay state to redis: %w", err)
	}
	return id, nil
}

// Consume reads + deletes the state in one round-trip. Returns
// ErrRelayStateNotFound when the key is absent (expired or already
// consumed). Single-use enforced at the database level — losing the race
// to a replay attack costs the attacker an entry, gains them nothing.
func (s *RelayStateStore) Consume(ctx context.Context, id string) (*RelayState, error) {
	if id == "" || !validRelayID(id) {
		return nil, ErrRelayStateNotFound
	}

	// GETDEL is atomic in Redis 6.2+. If the key isn't there we get a nil
	// reply which the client surfaces as redis.Nil.
	payload, err := s.rdb.GetDel(ctx, keyFor(id)).Bytes()
	if errors.Is(err, redis.Nil) {
		return nil, ErrRelayStateNotFound
	}
	if err != nil {
		s.log.Warn().Err(err).Msg("relay state GETDEL failed; failing closed")
		return nil, ErrRelayStateNotFound
	}

	var rs RelayState
	if err := json.Unmarshal(payload, &rs); err != nil {
		s.log.Warn().Err(err).Msg("relay state JSON unmarshal failed")
		return nil, ErrRelayStateNotFound
	}
	return &rs, nil
}

func keyFor(id string) string {
	return "relaystate:" + id
}

// validRelayID rejects values that aren't a valid base64url string of the
// expected length — prevents log-injection / key-namespace-collision via
// caller-controlled ids.
func validRelayID(id string) bool {
	if len(id) < 40 || len(id) > 50 {
		return false
	}
	_, err := base64.RawURLEncoding.DecodeString(id)
	return err == nil
}

// Suppress unused-import warning for uuid; intentionally imported for
// future SAML variant where the SP entity ID's request UUID is bound.
var _ = uuid.Nil
