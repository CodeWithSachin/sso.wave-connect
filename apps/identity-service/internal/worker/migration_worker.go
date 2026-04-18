// Package worker — migration_worker.go
//
// Phase 4 post-claim user migration. NATS consumer that subscribes to
// `sso.events.tenant.domain.verified` with queue group `migration-workers`.
// When a domain verifies, we look for consumer users on that domain and
// create one `tenant_domain_migrations` row per user + send the offer email.
//
// Queue group semantics: only one worker in the group receives each message,
// so HA deploys don't duplicate offers. The per-row unique constraint
// `uq_migration_user_org` is belt-and-suspenders against re-delivery after a
// crash between NATS ack and DB commit.
package worker

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog"

	"github.com/wave-connect/sso-platform/apps/identity-service/internal/email"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/event"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/repository"
	ssonats "github.com/wave-connect/sso-platform/libs/nats"
)

// MigrationWorker subscribes to domain-verified events and creates migration
// offers for matching consumer users. Zero-copy with the event_outbox
// dispatcher: this worker is a *consumer* of those events, not a producer.
type MigrationWorker struct {
	nats          *ssonats.Client
	pool          *pgxpool.Pool
	repo          *repository.TenantDomainMigrationRepository
	outbox        *event.Outbox
	emailProvider email.Provider
	deps          MigrationWorkerDeps
	log           zerolog.Logger
}

// MigrationWorkerDeps groups tunable wiring so main.go doesn't have to thread
// six positional args through NewMigrationWorker.
type MigrationWorkerDeps struct {
	// LinkBaseURL is the host of login-portal; the offer email sends users
	// to `${LinkBaseURL}/migration/${token}`. Without this, emails render
	// with a relative link which breaks outside localhost.
	LinkBaseURL string
	// SenderAddress is the From header for offer emails. Falls back to the
	// email provider's default if empty.
	SenderAddress string
	// GraceTTL — how long the user has to accept/decline before the org owner
	// can force-migrate. 30 days per Phase 4 plan.
	GraceTTL time.Duration
}

// NewMigrationWorker wires the worker and sets sensible defaults.
func NewMigrationWorker(
	nats *ssonats.Client,
	pool *pgxpool.Pool,
	repo *repository.TenantDomainMigrationRepository,
	outbox *event.Outbox,
	emailProvider email.Provider,
	deps MigrationWorkerDeps,
	log zerolog.Logger,
) *MigrationWorker {
	if deps.GraceTTL == 0 {
		deps.GraceTTL = 30 * 24 * time.Hour
	}
	return &MigrationWorker{
		nats:          nats,
		pool:          pool,
		repo:          repo,
		outbox:        outbox,
		emailProvider: emailProvider,
		deps:          deps,
		log:           log.With().Str("component", "migration_worker").Logger(),
	}
}

// Start subscribes to the verified-domain subject and blocks until ctx is
// cancelled. Returns nil on clean shutdown, non-nil if the subscription
// itself couldn't be established (which main.go treats as non-fatal —
// post-claim migration is an optional feature).
func (w *MigrationWorker) Start(ctx context.Context) error {
	if w.nats == nil {
		w.log.Warn().Msg("migration worker disabled: NATS client not configured")
		<-ctx.Done()
		return nil
	}
	subject := fmt.Sprintf("sso.events.%s", event.TypeTenantDomainVerified)
	// Close over Start's ctx so in-flight handlers abort cleanly on
	// shutdown. NATS' callback signature is `func([]byte)` — no ctx — so we
	// capture it via closure and let `handle` derive a per-message timeout.
	sub, err := w.nats.QueueSubscribe(subject, "migration-workers", func(data []byte) {
		w.handle(ctx, data)
	})
	if err != nil {
		return fmt.Errorf("subscribe %s: %w", subject, err)
	}
	w.log.Info().Str("subject", subject).Str("queue", "migration-workers").Msg("migration worker started")

	<-ctx.Done()
	w.log.Info().Msg("migration worker stopping")
	if err := sub.Unsubscribe(); err != nil {
		w.log.Warn().Err(err).Msg("unsubscribe failed")
	}
	return nil
}

// ── message handling ────────────────────────────────────────────────────────

// natsEnvelope matches the wire format produced by event.NATSPublisher —
// the outer envelope around the typed payload.
type natsEnvelope struct {
	Type      string          `json:"type"`
	Timestamp time.Time       `json:"timestamp"`
	TenantID  string          `json:"tenant_id"`
	ActorID   string          `json:"actor_id"`
	Payload   json.RawMessage `json:"payload"`
}

// handle runs per NATS message. Never panics — all errors are logged and the
// NATS message is implicitly acked (core NATS has no explicit ack, so we can
// only avoid work; the dedup guarantee comes from the DB unique constraint).
//
// `parent` is Start's context so a server shutdown cancels in-flight handlers.
// Derive a per-message 30s timeout on top of that so no single message can
// pin the goroutine indefinitely.
func (w *MigrationWorker) handle(parent context.Context, data []byte) {
	ctx, cancel := context.WithTimeout(parent, 30*time.Second)
	defer cancel()

	var env natsEnvelope
	if err := json.Unmarshal(data, &env); err != nil {
		w.log.Warn().Err(err).Msg("drop: malformed envelope")
		return
	}
	if env.Type != event.TypeTenantDomainVerified {
		w.log.Warn().Str("type", env.Type).Msg("drop: unexpected event type")
		return
	}
	var payload event.TenantDomainVerifiedPayload
	if err := json.Unmarshal(env.Payload, &payload); err != nil {
		w.log.Warn().Err(err).Msg("drop: malformed payload")
		return
	}

	w.processVerified(ctx, payload)
}

// processVerified is the public-shape entry point — extracted so tests can
// drive it without synthesizing a NATS message.
func (w *MigrationWorker) processVerified(ctx context.Context, p event.TenantDomainVerifiedPayload) {
	candidates, err := w.repo.ListCandidatesForDomain(ctx, p.Domain, p.TenantID)
	if err != nil {
		w.log.Error().Err(err).Str("domain", p.Domain).Msg("list candidates failed")
		return
	}
	if len(candidates) == 0 {
		w.log.Info().Str("domain", p.Domain).Str("tenant_id", p.TenantID.String()).Msg("no migration candidates")
		return
	}

	created := 0
	skipped := 0
	failed := 0
	for _, c := range candidates {
		switch w.offerOne(ctx, p, c) {
		case offerCreated:
			created++
		case offerDuplicate:
			skipped++
		case offerFailed:
			failed++
		}
	}
	w.log.Info().
		Str("domain", p.Domain).
		Str("tenant_id", p.TenantID.String()).
		Int("candidates", len(candidates)).
		Int("created", created).
		Int("skipped_duplicate", skipped).
		Int("failed", failed).
		Msg("migration offers processed")
}

// offerOutcome classifies a single candidate so processVerified can aggregate
// stats for the tick log.
type offerOutcome int

const (
	offerCreated offerOutcome = iota
	offerDuplicate
	offerFailed
)

// offerOne inserts the migration row, enqueues the `user.migration.offered`
// event in the same tx, and sends the email post-commit. Email send failures
// are logged but never roll back the DB row — the row is the source of truth
// and the admin can always resend.
func (w *MigrationWorker) offerOne(ctx context.Context, p event.TenantDomainVerifiedPayload, c repository.MigrationCandidate) offerOutcome {
	token, err := generateNotificationToken()
	if err != nil {
		w.log.Error().Err(err).Str("user_id", c.UserID.String()).Msg("generate token failed")
		return offerFailed
	}

	now := time.Now().UTC()
	row := &repository.TenantDomainMigration{
		ID:                uuid.New(),
		UserID:            c.UserID,
		FromTenantID:      c.FromTenantID,
		ToTenantID:        p.TenantID,
		Domain:            strings.ToLower(p.Domain),
		OfferedAt:         now,
		ExpiresAt:         now.Add(w.deps.GraceTTL),
		NotificationToken: token,
	}

	tx, err := w.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		w.log.Error().Err(err).Msg("begin offer tx failed")
		return offerFailed
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback(ctx)
		}
	}()

	if err := w.repo.CreateTx(ctx, tx, row); err != nil {
		if errors.Is(err, repository.ErrMigrationAlreadyOffered) {
			w.log.Debug().Str("user_id", c.UserID.String()).Msg("migration already offered; skipping")
			return offerDuplicate
		}
		w.log.Error().Err(err).Str("user_id", c.UserID.String()).Msg("create migration failed")
		return offerFailed
	}

	offered := event.Event{
		Type:      event.TypeUserMigrationOffered,
		Timestamp: now,
		TenantID:  p.TenantID,
		ActorID:   uuid.Nil, // system-generated; no specific actor
		Payload: event.UserMigrationOfferedPayload{
			MigrationID:  row.ID,
			UserID:       row.UserID,
			Email:        c.Email,
			FromTenantID: row.FromTenantID,
			ToTenantID:   row.ToTenantID,
			Domain:       row.Domain,
			ExpiresAt:    row.ExpiresAt,
		},
	}
	if err := w.outbox.EnqueueTx(ctx, tx, offered); err != nil {
		w.log.Error().Err(err).Msg("enqueue offered event failed")
		return offerFailed
	}

	if err := tx.Commit(ctx); err != nil {
		w.log.Error().Err(err).Msg("commit offer tx failed")
		return offerFailed
	}
	committed = true

	w.sendOfferEmail(ctx, c, row)
	return offerCreated
}

// sendOfferEmail is best-effort. Failures log but don't roll back the offer
// row; the migration is still valid and the admin can trigger a resend.
func (w *MigrationWorker) sendOfferEmail(ctx context.Context, c repository.MigrationCandidate, m *repository.TenantDomainMigration) {
	link := fmt.Sprintf("%s/migration/%s", strings.TrimRight(w.deps.LinkBaseURL, "/"), m.NotificationToken)
	// Plain-text template kept inline to match the pattern used in
	// signup_org.go. The nestjs-email package keeps the hbs equivalent for
	// any Node-side send, but the Go side has its own rendering path.
	body := fmt.Sprintf(
		`Hi %s,

Your email address (%s) belongs to the %s domain, which just joined a team workspace on WaveConnect.

You have two options:

  • JOIN %s — move your account into the team workspace.
    %s

  • KEEP personal workspace — stay on your current individual account.
    Reply from the link above.

You have until %s to decide. After that, the team's owner can move your account automatically.

— WaveConnect`,
		displayOrEmail(c),
		c.Email,
		m.Domain,
		m.Domain,
		link,
		m.ExpiresAt.Format("January 2, 2006"),
	)
	msg := email.Message{
		To:             c.Email,
		From:           w.deps.SenderAddress,
		Subject:        fmt.Sprintf("Your %s workspace is ready", m.Domain),
		Text:           body,
		IdempotencyKey: "migration-offer:" + m.ID.String(),
		Tags:           map[string]string{"category": "migration_offer"},
	}
	if _, err := w.emailProvider.Send(ctx, msg); err != nil {
		w.log.Warn().Err(err).Str("to", c.Email).Msg("migration offer email failed (row still valid)")
	}
}

// ── helpers ─────────────────────────────────────────────────────────────────

// displayOrEmail picks a greeting. Falls back to the local-part of the email
// if the candidate's display name is empty — avoids "Hi ," in the email.
func displayOrEmail(c repository.MigrationCandidate) string {
	if strings.TrimSpace(c.DisplayName) != "" {
		return c.DisplayName
	}
	if at := strings.Index(c.Email, "@"); at > 0 {
		return c.Email[:at]
	}
	return "there"
}

// generateNotificationToken returns a 32-byte random token (base64url, 43
// chars) suitable for the UNIQUE notification_token column.
func generateNotificationToken() (string, error) {
	raw, _, err := repository.GenerateToken()
	if err != nil {
		return "", err
	}
	return raw, nil
}
