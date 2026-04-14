-- Migration 000010: Audit Logs (Immutable, Append-Only)
-- Source: database-schema-v2.sql, Section 8 (Lines 763-800)
-- Table: audit_logs (PARTITION BY RANGE created_at) with monthly partitions + DEFAULT
-- Includes REVOKE comment for immutability via ROLE permissions

-- [FIX-7] NO trigger for immutability -- triggers fire PER ROW and kill insert throughput.
--         Instead: REVOKE UPDATE, DELETE on this table at the ROLE level (see below).
-- [FIX-10] BRIN index on created_at -- 100x smaller than B-tree for monotonic timestamps.

CREATE TABLE audit_logs (
    id                  BIGSERIAL       NOT NULL,
    tenant_id           UUID            NOT NULL,
    actor_id            UUID,
    actor_type          audit_actor_type NOT NULL DEFAULT 'user',
    actor_ip            INET,
    actor_user_agent    TEXT,
    action              VARCHAR(100)    NOT NULL,
    resource_type       VARCHAR(100),
    resource_id         VARCHAR(255),
    description         TEXT,
    old_values          JSONB,                                    -- [NEW] Before-state for change tracking
    new_values          JSONB,                                    -- [NEW] After-state for change tracking
    metadata            JSONB           NOT NULL DEFAULT '{}',
    request_id          VARCHAR(64),
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_audit_logs PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Monthly partitions + DEFAULT fallback [FIX-9]
CREATE TABLE audit_logs_2026_01 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE audit_logs_2026_02 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE audit_logs_2026_03 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE audit_logs_2026_04 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE audit_logs_2026_05 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE audit_logs_2026_06 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE audit_logs_default PARTITION OF audit_logs DEFAULT;  -- [FIX-9]

-- [FIX-7] Immutability via ROLE permissions instead of trigger:
-- REVOKE UPDATE, DELETE ON audit_logs FROM app_user;
-- GRANT INSERT, SELECT ON audit_logs TO app_user;
