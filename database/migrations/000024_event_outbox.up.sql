-- Migration 000024: Generic Event Outbox (Transactional Outbox Pattern)
--
-- Phase 4 prerequisite. The existing `authz_outbox` (migration 000012) is
-- OpenFGA-specific; this is the generic cousin for any domain event that the
-- identity-service wants to publish durably (e.g. `tenant.domain.verified`,
-- `user.migration.offered`). Without it, a post-commit NATS publish failure
-- drops the event permanently and downstream workers never fire.
--
-- Pattern (same as authz_outbox):
--
--   BEGIN;
--     UPDATE tenant_domains SET status='verified' WHERE id=...;
--     INSERT INTO event_outbox (event_type, tenant_id, payload) VALUES (...);
--   COMMIT;
--
--   -- Background dispatcher polls every ~2s:
--   WITH claim AS (
--     SELECT id FROM event_outbox
--     WHERE status IN ('pending','failed') AND not_before <= NOW()
--     ORDER BY id LIMIT 100 FOR UPDATE SKIP LOCKED
--   )
--   UPDATE event_outbox SET status='dispatching' WHERE id IN (SELECT id FROM claim)
--   RETURNING *;
--   -- For each claimed row: Publish(NATS) -> mark 'dispatched' or bump retry + reschedule.
--
-- A single process or many can run the dispatcher — SKIP LOCKED keeps them
-- from stepping on each other.

-- Style note: `status` is a TEXT+CHECK rather than an ENUM to stay consistent
-- with the pre-existing `authz_outbox` table (migration 000012). Dedicated
-- enums would be tidier for introspection, but mixing styles across sibling
-- outbox tables is worse than picking one convention and sticking with it.
-- The migration_status enum in 000025 is a domain-level type (appears in
-- app-facing responses) — different trade-off.
CREATE TABLE event_outbox (
    id              BIGSERIAL     PRIMARY KEY,

    -- What happened.
    event_type      TEXT          NOT NULL,           -- matches event.TypeXxx constants
    tenant_id       UUID,                             -- nullable: platform-level events may lack one
    actor_id        UUID,                             -- who triggered this (optional)
    payload         JSONB         NOT NULL,           -- typed event payload (see internal/event/events.go)

    -- Dispatch state.
    status          TEXT          NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'dispatching', 'dispatched', 'failed', 'dead_letter')),
    retry_count     SMALLINT      NOT NULL DEFAULT 0,
    max_retries     SMALLINT      NOT NULL DEFAULT 10,
    last_error      TEXT,

    -- Scheduling.
    -- not_before lets the dispatcher back off failed rows without blocking
    -- fresh pending rows. On failure: not_before := NOW() + exp-backoff.
    not_before      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    dispatched_at   TIMESTAMPTZ
);

-- Hot path: the dispatcher claim query. Partial index so it stays small as
-- dispatched rows accumulate.
CREATE INDEX idx_event_outbox_ready
    ON event_outbox (not_before, id)
    WHERE status IN ('pending', 'failed');

-- Diagnostics: "what events fired for this tenant today?"
CREATE INDEX idx_event_outbox_tenant
    ON event_outbox (tenant_id, created_at DESC)
    WHERE tenant_id IS NOT NULL;

-- Diagnostics: "show me the dead letters to investigate".
CREATE INDEX idx_event_outbox_dead_letter
    ON event_outbox (created_at DESC)
    WHERE status = 'dead_letter';

COMMENT ON TABLE event_outbox IS
    'Generic transactional outbox for domain events. Paired with an in-process dispatcher that publishes to NATS and marks rows dispatched. Dead-letter rows require manual inspection.';
COMMENT ON COLUMN event_outbox.event_type IS
    'Matches constants in apps/identity-service/internal/event/events.go (e.g. tenant.domain.verified).';
COMMENT ON COLUMN event_outbox.not_before IS
    'Dispatcher ignores rows with not_before > NOW(). Bumped on each retry with exponential backoff.';
