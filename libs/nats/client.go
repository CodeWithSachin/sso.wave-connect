package nats

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/nats-io/nats.go"
	"github.com/rs/zerolog"
)

// Config holds NATS connection settings.
type Config struct {
	URL string `mapstructure:"url"`
}

// Client wraps a NATS connection with structured logging and JSON helpers.
type Client struct {
	conn *nats.Conn
	log  zerolog.Logger
}

// Connect establishes a NATS connection with automatic reconnect.
func Connect(cfg Config, log zerolog.Logger) (*Client, error) {
	opts := []nats.Option{
		nats.Name("sso-platform"),
		nats.ReconnectWait(2 * time.Second),
		nats.MaxReconnects(-1), // Retry forever
		nats.DisconnectErrHandler(func(_ *nats.Conn, err error) {
			if err != nil {
				log.Warn().Err(err).Msg("NATS disconnected")
			}
		}),
		nats.ReconnectHandler(func(nc *nats.Conn) {
			log.Info().Str("url", nc.ConnectedUrl()).Msg("NATS reconnected")
		}),
	}

	conn, err := nats.Connect(cfg.URL, opts...)
	if err != nil {
		return nil, fmt.Errorf("nats connect: %w", err)
	}

	log.Info().Str("url", cfg.URL).Msg("NATS connected")
	return &Client{conn: conn, log: log.With().Str("component", "nats").Logger()}, nil
}

// Close drains and closes the NATS connection.
func (c *Client) Close() {
	if c.conn != nil {
		c.conn.Drain()
	}
}

// Publish sends a JSON-encoded message to a subject.
func (c *Client) Publish(subject string, data interface{}) error {
	payload, err := json.Marshal(data)
	if err != nil {
		return fmt.Errorf("marshal nats payload: %w", err)
	}
	if err := c.conn.Publish(subject, payload); err != nil {
		return fmt.Errorf("nats publish to %s: %w", subject, err)
	}
	c.log.Debug().Str("subject", subject).Msg("published")
	return nil
}

// Subscribe registers a handler for a subject. Every subscriber receives every message
// (fan-out). Use for cache invalidation where all replicas must process the event.
func (c *Client) Subscribe(subject string, handler func(data []byte)) (*nats.Subscription, error) {
	sub, err := c.conn.Subscribe(subject, func(msg *nats.Msg) {
		handler(msg.Data)
	})
	if err != nil {
		return nil, fmt.Errorf("nats subscribe to %s: %w", subject, err)
	}
	c.log.Info().Str("subject", subject).Msg("subscribed (broadcast)")
	return sub, nil
}

// QueueSubscribe registers a handler for a subject with a queue group. Only one member
// of the group receives each message. Use for work distribution (webhook delivery, audit logging).
func (c *Client) QueueSubscribe(subject, queue string, handler func(data []byte)) (*nats.Subscription, error) {
	sub, err := c.conn.QueueSubscribe(subject, queue, func(msg *nats.Msg) {
		handler(msg.Data)
	})
	if err != nil {
		return nil, fmt.Errorf("nats queue subscribe to %s/%s: %w", subject, queue, err)
	}
	c.log.Info().Str("subject", subject).Str("queue", queue).Msg("subscribed (queue)")
	return sub, nil
}

// Conn returns the underlying NATS connection for advanced use.
func (c *Client) Conn() *nats.Conn {
	return c.conn
}
