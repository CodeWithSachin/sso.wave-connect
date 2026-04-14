package event

import (
	"context"

	"github.com/rs/zerolog"
)

type Publisher interface {
	Publish(ctx context.Context, evt Event) error
}

// LogPublisher is a no-op publisher that logs events. NATS integration deferred to a later phase.
type LogPublisher struct {
	log zerolog.Logger
}

func NewLogPublisher(log zerolog.Logger) *LogPublisher {
	return &LogPublisher{log: log.With().Str("component", "event_publisher").Logger()}
}

func (p *LogPublisher) Publish(ctx context.Context, evt Event) error {
	p.log.Info().
		Str("event_type", evt.Type).
		Str("tenant_id", evt.TenantID.String()).
		Str("actor_id", evt.ActorID.String()).
		Interface("payload", evt.Payload).
		Msg("event published")
	return nil
}
