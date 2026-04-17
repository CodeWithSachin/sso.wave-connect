package subscriber

import (
	"encoding/json"

	"github.com/rs/zerolog"

	ssonats "github.com/wave-connect/sso-platform/libs/nats"

	"github.com/wave-connect/sso-platform/apps/authz-service/internal/service"
)

// CacheInvalidationMessage represents the payload for authz cache invalidation events.
type CacheInvalidationMessage struct {
	User     string `json:"user"`
	Relation string `json:"relation"`
	Object   string `json:"object"`
}

// RegisterCacheInvalidation subscribes to authz cache invalidation events.
// Uses broadcast (not queue group) so every replica invalidates its own L1 Ristretto.
func RegisterCacheInvalidation(nc *ssonats.Client, cacheSvc *service.CacheService, log zerolog.Logger) error {
	_, err := nc.Subscribe(ssonats.SubjectCacheInvalidateAuthz, func(data []byte) {
		var msg CacheInvalidationMessage
		if err := json.Unmarshal(data, &msg); err != nil {
			log.Warn().Err(err).Msg("failed to unmarshal cache invalidation message")
			return
		}

		// Invalidate both the specific check and any list objects related
		cacheSvc.InvalidateForTuple(msg.User, msg.Relation, msg.Object)
		log.Debug().
			Str("user", msg.User).
			Str("relation", msg.Relation).
			Str("object", msg.Object).
			Msg("L1 cache invalidated via NATS")
	})
	return err
}
