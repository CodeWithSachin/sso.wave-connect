// Package event — outbox.go
//
// Generic transactional outbox for domain events (migration 000024). Pair of
// types:
//
//	Outbox          — write-side. Enqueue(Tx) inserts a pending row in the
//	                  caller's transaction. Ensures the domain state change
//	                  and the event are durable together (or roll back
//	                  together).
//	Outbox.Claim    — read-side. Dispatcher worker pulls N ready rows,
//	                  atomically flipping them to 'dispatching' via
//	                  FOR UPDATE SKIP LOCKED so multiple processes don't
//	                  double-publish.
//
// Intentionally NOT an interface — there's exactly one implementation and
// the worker wants concrete types for backoff + retry bookkeeping.
package event

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrOutboxEmpty — Claim returned no rows. Not really an error; the worker
// uses this to decide whether to back off its poll interval.
var ErrOutboxEmpty = errors.New("event outbox empty")

// Outbox writes pending domain events into the durable `event_outbox` table.
type Outbox struct {
	pool *pgxpool.Pool
}

// NewOutbox wraps a pgxpool. The pool is used for the claim + dispatch path;
// the write path uses whichever tx the caller provides.
func NewOutbox(pool *pgxpool.Pool) *Outbox {
	return &Outbox{pool: pool}
}

// PendingEvent is the read-side row shape returned by Claim. Payload stays as
// raw JSON so the dispatcher can round-trip it through NATS without another
// marshal step.
type PendingEvent struct {
	ID         int64
	EventType  string
	TenantID   uuid.UUID // uuid.Nil if the DB column is NULL (platform-level event)
	ActorID    uuid.UUID // uuid.Nil if NULL
	Payload    json.RawMessage
	RetryCount int
	MaxRetries int
	CreatedAt  time.Time
}

// EnqueueTx inserts one event into the outbox inside the caller's transaction.
// The domain-side UPDATE (e.g. tenant_domains.status := 'verified') and this
// INSERT must happen together — that's the whole point of the outbox.
//
// The caller still hands us the typed Event so we capture the same metadata
// as a direct publisher.Publish would: event_type, tenant_id, actor_id, and
// the marshaled payload.
func (o *Outbox) EnqueueTx(ctx context.Context, tx pgx.Tx, evt Event) error {
	body, err := json.Marshal(evt.Payload)
	if err != nil {
		return fmt.Errorf("marshal outbox payload: %w", err)
	}
	const q = `INSERT INTO event_outbox (event_type, tenant_id, actor_id, payload)
		VALUES ($1, $2, $3, $4::jsonb)`
	if _, err := tx.Exec(ctx, q,
		evt.Type,
		uuidOrNil(evt.TenantID),
		uuidOrNil(evt.ActorID),
		body,
	); err != nil {
		return fmt.Errorf("insert event_outbox: %w", err)
	}
	return nil
}

// Enqueue is the non-transactional convenience wrapper. Use only when the
// caller has no transaction of its own — e.g. a post-commit retry path.
// Prefer EnqueueTx to guarantee atomicity with the domain change.
func (o *Outbox) Enqueue(ctx context.Context, evt Event) error {
	tx, err := o.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin outbox tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if err := o.EnqueueTx(ctx, tx, evt); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// ClaimLeaseDuration is how long a claimed row stays "owned" by a dispatcher
// before it's considered stuck and eligible for reclaim by another worker.
// Chosen to be comfortably larger than the per-event publish timeout (5s):
// under normal operation a dispatcher transitions the row to 'dispatched'
// or 'failed' well before this elapses. Only crash-kill / SIGKILL / OOM
// leaves a row in 'dispatching' past the lease.
//
// Tradeoff: lower value = faster recovery from crashes but higher chance of
// legitimate duplicate publishes if a publish is unexpectedly slow.
// Consumers of sso.events.* should tolerate at-least-once delivery anyway
// (migration worker guards via UNIQUE(user_id, to_tenant_id), etc.).
const ClaimLeaseDuration = 60 * time.Second

// Claim atomically selects up to `limit` ready rows and flips them to
// 'dispatching'. Uses FOR UPDATE SKIP LOCKED so HA deployments can run
// multiple dispatchers side-by-side.
//
// Three classes of rows are eligible:
//  1. status='pending' with not_before <= NOW()  — brand-new rows.
//  2. status='failed'  with not_before <= NOW()  — retry after backoff.
//  3. status='dispatching' with not_before <= NOW() — stuck rows from a
//     dispatcher that died mid-publish. Without this clause a SIGKILL at
//     exactly the wrong moment would leave the row orphaned forever.
//
// To make the stuck-row case safe, `not_before` is bumped by
// ClaimLeaseDuration on every successful claim. A crashing dispatcher will
// not have updated the row post-publish, so a second claim picks it up when
// the lease expires.
//
// Returns ErrOutboxEmpty (nil rows, nil error path) when the table is
// drained so the worker can sleep for the full poll interval.
func (o *Outbox) Claim(ctx context.Context, limit int) ([]PendingEvent, error) {
	if limit <= 0 {
		limit = 50
	}
	// CTE-based claim. A single round-trip to avoid two separate round-trips
	// for the SELECT + UPDATE, and to keep the lock window tight.
	const q = `WITH claim AS (
		SELECT id FROM event_outbox
		WHERE status IN ('pending','failed','dispatching')
		  AND not_before <= NOW()
		ORDER BY id
		FOR UPDATE SKIP LOCKED
		LIMIT $1
	)
	UPDATE event_outbox e
	SET status = 'dispatching',
	    not_before = NOW() + make_interval(secs => $2)
	FROM claim
	WHERE e.id = claim.id
	RETURNING e.id, e.event_type, e.tenant_id, e.actor_id, e.payload,
	          e.retry_count, e.max_retries, e.created_at`
	rows, err := o.pool.Query(ctx, q, limit, ClaimLeaseDuration.Seconds())
	if err != nil {
		return nil, fmt.Errorf("claim outbox: %w", err)
	}
	defer rows.Close()

	out := []PendingEvent{}
	for rows.Next() {
		var (
			p        PendingEvent
			tenantID *uuid.UUID
			actorID  *uuid.UUID
		)
		if err := rows.Scan(
			&p.ID, &p.EventType, &tenantID, &actorID, &p.Payload,
			&p.RetryCount, &p.MaxRetries, &p.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan outbox row: %w", err)
		}
		if tenantID != nil {
			p.TenantID = *tenantID
		}
		if actorID != nil {
			p.ActorID = *actorID
		}
		out = append(out, p)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(out) == 0 {
		return nil, ErrOutboxEmpty
	}
	return out, nil
}

// MarkDispatched flips a claimed row to terminal 'dispatched'. Called by the
// worker after a successful publisher.Publish.
func (o *Outbox) MarkDispatched(ctx context.Context, id int64) error {
	const q = `UPDATE event_outbox
		SET status = 'dispatched',
		    dispatched_at = NOW(),
		    last_error = NULL
		WHERE id = $1`
	if _, err := o.pool.Exec(ctx, q, id); err != nil {
		return fmt.Errorf("mark dispatched: %w", err)
	}
	return nil
}

// MarkFailed moves the row back to 'failed' (or 'dead_letter' once max_retries
// is exhausted) and bumps retry_count + not_before for exponential backoff.
//
// Backoff strategy: capped exponential at 2^retry seconds, max 5 minutes. The
// caller computes nextRetryIn; passing 0 means use the default schedule.
func (o *Outbox) MarkFailed(ctx context.Context, id int64, lastErr string, nextRetryIn time.Duration) error {
	if nextRetryIn < 0 {
		nextRetryIn = 0
	}
	const q = `UPDATE event_outbox
		SET retry_count = retry_count + 1,
		    last_error = $2,
		    status = CASE
		        WHEN retry_count + 1 >= max_retries THEN 'dead_letter'
		        ELSE 'failed'
		    END,
		    not_before = NOW() + make_interval(secs => $3)
		WHERE id = $1`
	if _, err := o.pool.Exec(ctx, q, id, truncateErr(lastErr), nextRetryIn.Seconds()); err != nil {
		return fmt.Errorf("mark failed: %w", err)
	}
	return nil
}

// BackoffFor returns the exponential-backoff delay for a given attempt number.
// Attempt 0 → 2s, 1 → 4s, 2 → 8s, ... capped at 5 min. Shared between the
// worker and tests so we can assert the schedule.
func BackoffFor(attempt int) time.Duration {
	if attempt < 0 {
		attempt = 0
	}
	if attempt > 10 {
		attempt = 10
	}
	secs := 1 << uint(attempt+1) // 2,4,8,16,32,64,128,256,...
	d := time.Duration(secs) * time.Second
	max := 5 * time.Minute
	if d > max {
		d = max
	}
	return d
}

// ── helpers ─────────────────────────────────────────────────────────────────

// uuidOrNil returns nil for uuid.Nil so the DB column stores NULL rather than
// '00000000-0000-0000-0000-000000000000'. pgx accepts (*uuid.UUID)(nil).
func uuidOrNil(id uuid.UUID) any {
	if id == uuid.Nil {
		return nil
	}
	return id
}

// truncateErr keeps last_error from blowing past a reasonable column size.
// TEXT has no length cap but we don't need 10KB stack traces in the outbox.
func truncateErr(s string) string {
	const max = 1024
	if len(s) <= max {
		return s
	}
	return s[:max]
}
