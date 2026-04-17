package event

import (
	"context"
	"fmt"

	"github.com/rs/zerolog"

	ssonats "github.com/wave-connect/sso-platform/libs/nats"
)

// NATSPublisher publishes events to NATS subjects.
// Falls back to LogPublisher on any failure — auth flow is never blocked.
type NATSPublisher struct {
	nats     *ssonats.Client
	fallback Publisher
	log      zerolog.Logger
}

func NewNATSPublisher(nats *ssonats.Client, fallback Publisher, log zerolog.Logger) *NATSPublisher {
	return &NATSPublisher{
		nats:     nats,
		fallback: fallback,
		log:      log.With().Str("component", "nats_publisher").Logger(),
	}
}

func (p *NATSPublisher) Publish(ctx context.Context, evt Event) error {
	// Always log via fallback
	_ = p.fallback.Publish(ctx, evt)

	// Map event type to NATS subject
	subject := fmt.Sprintf("sso.events.%s", evt.Type)

	payload := map[string]interface{}{
		"type":      evt.Type,
		"timestamp": evt.Timestamp,
		"tenant_id": evt.TenantID.String(),
		"actor_id":  evt.ActorID.String(),
		"payload":   evt.Payload,
	}

	if err := p.nats.Publish(subject, payload); err != nil {
		p.log.Warn().Err(err).Str("subject", subject).Msg("NATS publish failed")
		// Never fail auth flow
		return nil
	}

	return nil
}
