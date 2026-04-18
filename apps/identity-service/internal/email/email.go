// Package email provides the identity-service side of the shared email
// abstraction. Mirrors the interface shape in `libs/nestjs-email` so the two
// codebases agree on what a provider looks like, but ships a separate Go
// implementation because Go and Node can't share the same runtime package.
//
// Phase 1 ships only `ConsoleProvider` (logs to stdout). SES lands in Phase 2
// alongside the NATS-outbox consumer; until then production deployments
// should set EMAIL_PROVIDER=console and rely on a separate alerting channel
// for unsent emails.
package email

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/rs/zerolog"
)

// Message is the transport-neutral representation of a single transactional
// email. Templating happens before this struct is built — providers never
// touch template variables.
type Message struct {
	To      string
	From    string // if empty, provider falls back to its default sender
	ReplyTo string
	Subject string
	Text    string // always required
	HTML    string // optional
	// IdempotencyKey dedupes retries at the provider layer where supported.
	// Callers should pass a stable hash of the underlying event (e.g. SHA-256
	// of the verification token) so the outbox can safely re-enqueue.
	IdempotencyKey string
	Tags           map[string]string
}

// SendResult captures what a provider acknowledged. MessageID is guaranteed
// to be non-empty on success; AcceptedAt is wall-clock time of the provider
// ack (not necessarily delivery).
type SendResult struct {
	MessageID  string
	AcceptedAt time.Time
}

// Provider is the minimum contract for a working transactional-email sender.
// Implementations must resolve on accept-for-delivery (not inbox delivery)
// and return a non-nil error on hard failure. Retries are the caller's
// responsibility via the outbox pattern.
type Provider interface {
	Send(ctx context.Context, msg Message) (SendResult, error)
	Name() string
}

// ErrNotConfigured is returned by stub providers that aren't wired up yet.
// Callers can detect this to fall through to a secondary provider without
// treating the failure as fatal during the Phase 1/2 transition.
var ErrNotConfigured = errors.New("email provider not configured")

// ConsoleProvider writes the message to the logger and returns a synthetic
// message-id. Zero network I/O — safe for unit tests, e2e fixtures, and any
// dev environment that doesn't have an SMTP/SES endpoint. The log format is
// deliberately stable so log-based e2e assertions can grep it:
//
//	[email] to=<addr> subject=<escaped> messageId=<id>
type ConsoleProvider struct {
	log    zerolog.Logger
	sender string
}

// NewConsoleProvider creates a ConsoleProvider. `sender` is used as the default
// From when Message.From is empty; passing an empty string falls through to a
// generic "noreply@wave-connect.local".
func NewConsoleProvider(log zerolog.Logger, sender string) *ConsoleProvider {
	if sender == "" {
		sender = "noreply@wave-connect.local"
	}
	return &ConsoleProvider{
		log:    log.With().Str("component", "email").Logger(),
		sender: sender,
	}
}

// Name returns "console" — matches the EMAIL_PROVIDER env value.
func (p *ConsoleProvider) Name() string { return "console" }

// Send logs the message and returns a synthetic message-id. Never returns an
// error under normal operation; rand.Read failure surfaces as fmt-wrapped.
func (p *ConsoleProvider) Send(_ context.Context, msg Message) (SendResult, error) {
	from := msg.From
	if from == "" {
		from = p.sender
	}

	b := make([]byte, 12)
	if _, err := rand.Read(b); err != nil {
		return SendResult{}, fmt.Errorf("generate message id: %w", err)
	}
	messageID := "console-" + hex.EncodeToString(b)

	evt := p.log.Info().
		Str("provider", "console").
		Str("to", msg.To).
		Str("from", from).
		Str("subject", msg.Subject).
		Str("message_id", messageID)
	if msg.IdempotencyKey != "" {
		evt = evt.Str("idempotency_key", msg.IdempotencyKey)
	}
	// One-line summary suitable for grep-based test assertions.
	evt.Msgf("[email] to=%s subject=%q messageId=%s", msg.To, msg.Subject, messageID)

	// Full body at debug level to avoid log spam in staging/prod.
	p.log.Debug().Msg("[email body] " + collapseWhitespace(msg.Text))

	return SendResult{
		MessageID:  messageID,
		AcceptedAt: time.Now().UTC(),
	}, nil
}

// SESProvider is a stub — implemented in Phase 2 alongside AWS SDK wiring.
// Leaving the type in place now lets the main.go factory stay stable.
type SESProvider struct {
	log    zerolog.Logger
	sender string
}

// NewSESProvider returns a stub. Attempting to call Send() always returns
// ErrNotConfigured — swap bindings to ConsoleProvider until Phase 2.
func NewSESProvider(log zerolog.Logger, sender string) *SESProvider {
	return &SESProvider{log: log, sender: sender}
}

// Name returns "ses".
func (p *SESProvider) Name() string { return "ses" }

// Send is unimplemented — always returns ErrNotConfigured.
func (p *SESProvider) Send(_ context.Context, msg Message) (SendResult, error) {
	p.log.Error().
		Str("provider", "ses").
		Str("to", msg.To).
		Msg("SES provider called before Phase 2 wiring")
	return SendResult{}, fmt.Errorf("%w: SES not yet implemented (attempted to=%s)", ErrNotConfigured, msg.To)
}

// Kind is the env-keyed provider selector shared with the main.go factory.
type Kind string

const (
	KindConsole Kind = "console"
	KindSES     Kind = "ses"
)

// FromEnv parses a provider kind from an environment string. Empty falls back
// to console (dev-safe default). Unknown values fail loudly — callers should
// invoke this at boot so a typo in EMAIL_PROVIDER doesn't silently drop mail.
func FromEnv(raw string) (Kind, error) {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "", "console":
		return KindConsole, nil
	case "ses":
		return KindSES, nil
	default:
		return "", fmt.Errorf("unknown EMAIL_PROVIDER %q; valid: console | ses", raw)
	}
}

// collapseWhitespace is a small helper for the debug body log — keeps the log
// one-line per event so tooling like `grep` works predictably.
func collapseWhitespace(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	prevSpace := false
	for _, r := range s {
		if r == ' ' || r == '\t' || r == '\n' || r == '\r' {
			if !prevSpace {
				b.WriteRune(' ')
				prevSpace = true
			}
			continue
		}
		b.WriteRune(r)
		prevSpace = false
	}
	return strings.TrimSpace(b.String())
}
