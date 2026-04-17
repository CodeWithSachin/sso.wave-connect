package event

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/rs/zerolog"

	ssonats "github.com/wave-connect/sso-platform/libs/nats"
)

type Publisher interface {
	Publish(ctx context.Context, evt Event) error
}

// LogPublisher logs events to stdout. Used as a fallback when WebhookPublisher is not configured.
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

// WebhookPublisher forwards events to the webhook-service internal dispatch endpoint.
// Delivery failures are logged but never block the auth flow.
type WebhookPublisher struct {
	dispatchURL string
	httpClient  *http.Client
	fallback    Publisher
	log         zerolog.Logger
}

func NewWebhookPublisher(dispatchURL string, fallback Publisher, log zerolog.Logger) *WebhookPublisher {
	return &WebhookPublisher{
		dispatchURL: dispatchURL,
		httpClient:  &http.Client{Timeout: 3 * time.Second},
		fallback:    fallback,
		log:         log.With().Str("component", "webhook_publisher").Logger(),
	}
}

func (p *WebhookPublisher) Publish(ctx context.Context, evt Event) error {
	// Always log first via fallback
	_ = p.fallback.Publish(ctx, evt)

	body := map[string]interface{}{
		"tenantId":  evt.TenantID.String(),
		"eventType": evt.Type,
		"data":      evt.Payload,
	}
	jsonBody, err := json.Marshal(body)
	if err != nil {
		p.log.Warn().Err(err).Msg("failed to marshal webhook dispatch payload")
		return nil // Never fail auth flow
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.dispatchURL, bytes.NewReader(jsonBody))
	if err != nil {
		p.log.Warn().Err(err).Msg("failed to create webhook dispatch request")
		return nil
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := p.httpClient.Do(req)
	if err != nil {
		p.log.Warn().Err(err).Msg("webhook dispatch failed")
		return nil
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		p.log.Warn().
			Int("status", resp.StatusCode).
			Str("event_type", evt.Type).
			Msg("webhook dispatch returned non-2xx")
	} else {
		p.log.Debug().
			Str("event_type", evt.Type).
			Msg("webhook dispatch successful")
	}

	return nil
}

// NewPublisher creates the appropriate publisher based on configuration.
// Priority: NATS > Webhook HTTP > Log-only.
// If natsClient is provided, uses NATSPublisher (with LogPublisher fallback).
// Else if webhookURL is provided, uses WebhookPublisher (with LogPublisher fallback).
// Otherwise, uses LogPublisher directly.
func NewPublisher(webhookURL string, natsClient interface{}, log zerolog.Logger) Publisher {
	logPub := NewLogPublisher(log)

	// Check if NATS client is available (passed as interface to avoid import cycle)
	if natsClient != nil {
		if nc, ok := natsClient.(*ssonats.Client); ok && nc != nil {
			return NewNATSPublisher(nc, logPub, log)
		}
	}

	if webhookURL == "" {
		return logPub
	}
	url := fmt.Sprintf("%s/internal/dispatch", webhookURL)
	return NewWebhookPublisher(url, logPub, log)
}
