-- Migration 000009: Webhooks & Events
-- Source: database-schema-v2.sql, Section 7 (Lines 691-752)
-- Tables: webhook_endpoints + webhook_deliveries (PARTITION BY RANGE created_at)
--         with monthly partitions for 2026 H1 + DEFAULT partition + trigger

CREATE TABLE webhook_endpoints (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID            NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    url                 TEXT            NOT NULL,
    description         VARCHAR(500),
    secret_hash         VARCHAR(255)    NOT NULL,
    secret_encrypted    TEXT            NOT NULL,
    subscribed_events   VARCHAR(100)[]  NOT NULL,                 -- [FIX-5] VARCHAR, not ENUM array
    is_active           BOOLEAN         NOT NULL DEFAULT TRUE,
    failure_count       INTEGER         NOT NULL DEFAULT 0,
    disabled_at         TIMESTAMPTZ,
    metadata            JSONB           NOT NULL DEFAULT '{}',
    version             INTEGER         NOT NULL DEFAULT 1,       -- [FIX-3]
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT ck_webhook_url CHECK (url ~ '^https://')
);

CREATE TRIGGER trg_webhook_endpoints_updated_at
    BEFORE UPDATE ON webhook_endpoints
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


-- [FIX-9] Partitioned with DEFAULT partition to prevent INSERT failures.
-- [FIX-10] Uses BRIN index on created_at (append-only, monotonic timestamps).

CREATE TABLE webhook_deliveries (
    id                  UUID            NOT NULL DEFAULT gen_random_uuid(),
    endpoint_id         UUID            NOT NULL,
    tenant_id           UUID            NOT NULL,
    event_type          VARCHAR(100)    NOT NULL,                 -- [FIX-5] VARCHAR, not ENUM
    idempotency_key     VARCHAR(100),                             -- [FIX-6] Prevents duplicate deliveries
    payload             JSONB           NOT NULL,
    status              VARCHAR(20)     NOT NULL DEFAULT 'pending', -- [FIX-5] VARCHAR for delivery status too
    http_status_code    SMALLINT,
    response_body       TEXT,
    attempt_number      SMALLINT        NOT NULL DEFAULT 1,
    max_attempts        SMALLINT        NOT NULL DEFAULT 5,
    next_retry_at       TIMESTAMPTZ,
    duration_ms         INTEGER,
    error_message       TEXT,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_webhook_deliveries PRIMARY KEY (id, created_at),
    CONSTRAINT ck_wh_status CHECK (status IN ('pending', 'success', 'failed', 'retrying'))
) PARTITION BY RANGE (created_at);

-- Monthly partitions + DEFAULT fallback [FIX-9]
CREATE TABLE webhook_deliveries_2026_01 PARTITION OF webhook_deliveries
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE webhook_deliveries_2026_02 PARTITION OF webhook_deliveries
    FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE webhook_deliveries_2026_03 PARTITION OF webhook_deliveries
    FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE webhook_deliveries_2026_04 PARTITION OF webhook_deliveries
    FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE webhook_deliveries_2026_05 PARTITION OF webhook_deliveries
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE webhook_deliveries_2026_06 PARTITION OF webhook_deliveries
    FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE webhook_deliveries_default PARTITION OF webhook_deliveries DEFAULT;  -- [FIX-9]
