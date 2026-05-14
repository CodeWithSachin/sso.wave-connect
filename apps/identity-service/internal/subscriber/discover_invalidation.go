// Package subscriber houses NATS subscribers that react to domain events
// emitted elsewhere in the system.
//
// discover_invalidation.go listens for `tenant.domain.verified` and
// `tenant.domain.expired` and invalidates the Redis cache used by Phase 3's
// email-first login discovery. Without this, the cached `consumer` result
// for a newly-verified domain would sit in Redis for up to 5 minutes before
// the TTL expired and a fresh lookup reflected the new tenant — users
// caught in that window would see the consumer UI even though their
// workspace is now claimed.
//
// Fan-out subscribe (no queue group) because every identity-service
// replica runs its own Redis cache view and all replicas need the
// invalidation signal. Cache-invalidate messages are cheap; duplicate
// DEL calls are idempotent.
package subscriber

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/rs/zerolog"

	"github.com/wave-connect/sso-platform/apps/identity-service/internal/event"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/service"
	ssonats "github.com/wave-connect/sso-platform/libs/nats"
)

// RegisterDiscoverInvalidation attaches two subjects to the DiscoverService's
// InvalidateDomain method. Returns immediately after subscribing — the NATS
// client keeps the subscriptions alive until Drain() (handled by the main
// graceful-shutdown path).
//
// Either nil dep disables the wiring (and returns nil): a local `go run`
// without NATS still boots cleanly, it just falls back to the cache's
// natural TTL.
func RegisterDiscoverInvalidation(nc *ssonats.Client, discoverSvc *service.DiscoverService, log zerolog.Logger) error {
	if nc == nil || discoverSvc == nil {
		log.Warn().Msg("discover cache invalidation subscriber disabled (nil NATS or DiscoverService)")
		return nil
	}

	log = log.With().Str("component", "discover_invalidator").Logger()

	verifiedSubject := fmt.Sprintf("sso.events.%s", event.TypeTenantDomainVerified)
	expiredSubject := fmt.Sprintf("sso.events.%s", event.TypeTenantDomainExpired)

	handler := func(data []byte) {
		// Short-lived ctx — invalidation is a single Redis DEL; 5s is
		// plenty even during cross-region network blips.
		ctx, cancel := contextWithBudget(5)
		defer cancel()

		var env struct {
			Type    string          `json:"type"`
			Payload json.RawMessage `json:"payload"`
		}
		if err := json.Unmarshal(data, &env); err != nil {
			log.Warn().Err(err).Msg("drop: malformed envelope")
			return
		}
		var payload event.TenantDomainVerifiedPayload
		if err := json.Unmarshal(env.Payload, &payload); err != nil {
			log.Warn().Err(err).Str("type", env.Type).Msg("drop: malformed payload")
			return
		}
		if payload.Domain == "" {
			return
		}
		discoverSvc.InvalidateDomain(ctx, payload.Domain)
		log.Debug().Str("type", env.Type).Str("domain", payload.Domain).Msg("discover cache invalidated")
	}

	if _, err := nc.Subscribe(verifiedSubject, handler); err != nil {
		return fmt.Errorf("subscribe %s: %w", verifiedSubject, err)
	}
	if _, err := nc.Subscribe(expiredSubject, handler); err != nil {
		return fmt.Errorf("subscribe %s: %w", expiredSubject, err)
	}
	log.Info().
		Str("verified_subject", verifiedSubject).
		Str("expired_subject", expiredSubject).
		Msg("discover cache invalidation subscriber started")
	return nil
}

// contextWithBudget is a tiny helper to avoid importing time here just for
// the one call site. Seconds-granularity is fine — Redis DEL is sub-ms.
func contextWithBudget(seconds int) (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), secondsDuration(seconds))
}
