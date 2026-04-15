package repository

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

const authCodePrefix = "authcode:used:"
const authCodeTTL = 10 * time.Minute

// AuthCodeTracker prevents authorization code replay by tracking used codes in Redis.
// Uses SETNX (set-if-not-exists) for atomic single-use enforcement.
type AuthCodeTracker struct {
	rdb *redis.Client
}

func NewAuthCodeTracker(rdb *redis.Client) *AuthCodeTracker {
	return &AuthCodeTracker{rdb: rdb}
}

// MarkUsed atomically marks an auth code as used. Returns true if the code was
// successfully marked (first use), false if it was already used (replay).
func (t *AuthCodeTracker) MarkUsed(ctx context.Context, code string) (bool, error) {
	// Hash the code to avoid storing the full PASETO token in Redis
	h := sha256.Sum256([]byte(code))
	key := authCodePrefix + hex.EncodeToString(h[:16]) // First 16 bytes = 128 bits, sufficient

	// SETNX: returns true only if the key didn't exist
	set, err := t.rdb.SetNX(ctx, key, "1", authCodeTTL).Result()
	if err != nil {
		return false, fmt.Errorf("auth code tracker setnx: %w", err)
	}

	return set, nil // true = first use (allowed), false = replay (reject)
}
