// Package worker — event_outbox_worker.go
//
// In-process dispatcher for the generic event outbox (migration 000024).
// Polls every `pollInterval`, claims up to `batchSize` ready rows, publishes
// each via the existing event.Publisher, and records the outcome.
//
// Separate from `authz_outbox_worker` (OpenFGA-specific). Intentionally dumb:
// one poll → one batch → publish sequentially. Bounded-concurrency can be
// added later by fan-out across a worker pool if throughput demands it.
package worker

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/rs/zerolog"

	"github.com/wave-connect/sso-platform/apps/identity-service/internal/event"
)

// EventOutboxWorker drains `event_outbox` rows through the configured
// publisher. Shares the Publisher with the rest of the app so NATS vs webhook
// vs log is a single config decision.
type EventOutboxWorker struct {
	outbox    *event.Outbox
	publisher event.Publisher
	interval  time.Duration
	batch     int
	log       zerolog.Logger
}

// NewEventOutboxWorker wires the dispatcher.
//
//	interval — poll cadence when the outbox is empty (default 2s).
//	batch    — max rows claimed per poll (default 50).
func NewEventOutboxWorker(outbox *event.Outbox, publisher event.Publisher, interval time.Duration, batch int, log zerolog.Logger) *EventOutboxWorker {
	if interval == 0 {
		interval = 2 * time.Second
	}
	if batch == 0 {
		batch = 50
	}
	return &EventOutboxWorker{
		outbox:    outbox,
		publisher: publisher,
		interval:  interval,
		batch:     batch,
		log:       log.With().Str("component", "event_outbox_worker").Logger(),
	}
}

// Start blocks until ctx is cancelled. On each tick:
//  1. Claim a batch of ready rows.
//  2. For each row: reconstruct the typed event, publish, mark outcome.
//
// If the claim returns ErrOutboxEmpty, the worker sleeps the full interval.
// If work is found, the worker re-polls immediately to drain bursts without
// interval-capped throughput.
func (w *EventOutboxWorker) Start(ctx context.Context) {
	w.log.Info().Dur("interval", w.interval).Int("batch", w.batch).Msg("event outbox worker started")
	// Short warm-up so DB/NATS connections are established before we hammer.
	select {
	case <-ctx.Done():
		return
	case <-time.After(5 * time.Second):
	}
	for {
		if ctx.Err() != nil {
			w.log.Info().Msg("event outbox worker stopping")
			return
		}
		drained := w.drainOnce(ctx)
		if !drained {
			select {
			case <-ctx.Done():
				w.log.Info().Msg("event outbox worker stopping")
				return
			case <-time.After(w.interval):
			}
		}
	}
}

// drainOnce claims+dispatches one batch. Returns true iff any rows were found
// — the caller uses this to decide whether to sleep.
func (w *EventOutboxWorker) drainOnce(ctx context.Context) bool {
	rows, err := w.outbox.Claim(ctx, w.batch)
	if err != nil {
		if errors.Is(err, event.ErrOutboxEmpty) {
			return false
		}
		w.log.Warn().Err(err).Msg("claim failed")
		return false
	}
	for _, row := range rows {
		w.dispatchOne(ctx, row)
	}
	w.log.Debug().Int("dispatched", len(rows)).Msg("outbox drain tick")
	return true
}

// dispatchOne publishes a single claimed row. Marks dispatched on success,
// failed with exponential backoff on error.
func (w *EventOutboxWorker) dispatchOne(ctx context.Context, row event.PendingEvent) {
	// Reconstruct the typed event. Payload stays as raw JSON — the NATS
	// publisher json.Marshals it anyway, and keeping RawMessage avoids a
	// second round-trip through a concrete Go type that the worker doesn't
	// actually need to know.
	evt := event.Event{
		Type:      row.EventType,
		Timestamp: row.CreatedAt,
		TenantID:  row.TenantID,
		ActorID:   row.ActorID,
		Payload:   json.RawMessage(row.Payload),
	}

	// Bound per-event publish so a hung NATS can't freeze the loop.
	pubCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	err := w.publisher.Publish(pubCtx, evt)
	cancel()
	if err != nil {
		delay := event.BackoffFor(row.RetryCount)
		if merr := w.outbox.MarkFailed(ctx, row.ID, err.Error(), delay); merr != nil {
			w.log.Error().Err(merr).Int64("outbox_id", row.ID).Msg("mark failed errored")
		} else {
			w.log.Warn().
				Err(err).
				Int64("outbox_id", row.ID).
				Str("event_type", row.EventType).
				Int("retry_count", row.RetryCount+1).
				Dur("retry_in", delay).
				Msg("outbox dispatch failed; scheduled retry")
		}
		return
	}
	if err := w.outbox.MarkDispatched(ctx, row.ID); err != nil {
		w.log.Error().Err(err).Int64("outbox_id", row.ID).Msg("mark dispatched errored")
	}
}
