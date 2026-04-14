-- Migration 000012: Authorization Outbox & Permission Cache
-- Source: database-schema-v2.sql, Section 9.5 (Lines 906-975)
-- Tables: authz_outbox + permission_cache (UNLOGGED) + their indexes

-- ============================================================================
-- 9.5.1 AUTHORIZATION OUTBOX (Transactional Outbox Pattern)
-- ============================================================================
-- WHY: Postgres and OpenFGA are two separate systems. If you commit a membership
--      to Postgres but the OpenFGA WriteTuple call fails (network, timeout, pod
--      restart), the user exists but has no permissions. The outbox guarantees
--      EVENTUAL CONSISTENCY: both writes happen in the same Postgres transaction,
--      and a background worker drains pending tuples to OpenFGA.
--
-- PATTERN:
--   BEGIN;
--     INSERT INTO memberships (user_id, tenant_id, role) VALUES (...);
--     INSERT INTO authz_outbox (tuple_user, tuple_relation, tuple_object, ...)
--       VALUES ('user:<uuid>', 'member', 'organization:<uuid>', ...);
--   COMMIT;
--
--   -- Background worker polls every 1-5 seconds:
--   SELECT * FROM authz_outbox WHERE status IN ('pending','failed') ORDER BY created_at LIMIT 100;
--   -- For each: WriteTuple to OpenFGA -> mark 'completed' (or 'failed' + retry_count++)

CREATE TABLE authz_outbox (
    id              BIGSERIAL       PRIMARY KEY,
    tenant_id       UUID            NOT NULL REFERENCES tenants(id),
    store_id        VARCHAR(100)    NOT NULL,       -- OpenFGA store ID for this tenant
    operation       VARCHAR(10)     NOT NULL CHECK (operation IN ('write', 'delete')),
    tuple_user      VARCHAR(500)    NOT NULL,       -- e.g. 'user:550e8400-...'
    tuple_relation  VARCHAR(100)    NOT NULL,       -- e.g. 'member', 'editor', 'viewer'
    tuple_object    VARCHAR(500)    NOT NULL,       -- e.g. 'organization:550e8400-...'
    condition_name  VARCHAR(100),                   -- Optional: OpenFGA conditional tuple
    condition_ctx   JSONB,                          -- Optional: condition context JSON
    status          VARCHAR(20)     NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'dead_letter')),
    retry_count     SMALLINT        NOT NULL DEFAULT 0,
    max_retries     SMALLINT        NOT NULL DEFAULT 5,
    last_error      TEXT,
    idempotency_key VARCHAR(255)    NOT NULL,       -- Prevent duplicate tuple writes on retry
    -- [GAP-4] Audit trail columns -- who initiated this permission change and from where
    actor_user_id   UUID,                           -- Who initiated this change
    source          VARCHAR(50)     NOT NULL DEFAULT 'api'
                    CHECK (source IN ('api', 'scim', 'saml_sync', 'admin_ui', 'system', 'migration')),
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    processed_at    TIMESTAMPTZ,

    CONSTRAINT uq_authz_outbox_idempotency UNIQUE (idempotency_key)
);

-- Only index pending/failed rows -- completed rows are the vast majority and don't need querying
CREATE INDEX idx_authz_outbox_pending
    ON authz_outbox (status, created_at)
    WHERE status IN ('pending', 'failed');

-- For audit trail queries: "who changed permissions for this object?"
CREATE INDEX idx_authz_outbox_object
    ON authz_outbox (tuple_object, created_at DESC)
    WHERE status = 'completed';

-- For actor audit: "what permission changes did this admin make?"
CREATE INDEX idx_authz_outbox_actor
    ON authz_outbox (actor_user_id, created_at DESC)
    WHERE actor_user_id IS NOT NULL;


-- ============================================================================
-- 9.5.2 PERMISSION CACHE (L3 Fallback for OpenFGA Downtime)
-- ============================================================================
-- WHY: If OpenFGA goes down, Redis L1/L2 caches expire in 30s. After that,
--      all permission checks fail -> total platform outage. This UNLOGGED table
--      acts as an L3 cache with longer TTLs (5-15 min). It's stale but prevents
--      a hard deny-all during outages.
--
-- NOT a replacement for OpenFGA -- it's a circuit-breaker fallback.
-- The Go auth service checks: L1 (in-process) -> L2 (Redis) -> L3 (this table) -> OpenFGA

CREATE UNLOGGED TABLE permission_cache (
    user_id         UUID            NOT NULL,
    tenant_id       UUID            NOT NULL,
    relation        VARCHAR(100)    NOT NULL,       -- 'can_read', 'can_write', 'viewer', etc.
    object_type     VARCHAR(50)     NOT NULL,       -- 'folder', 'document', 'organization', etc.
    object_id       UUID            NOT NULL,
    allowed         BOOLEAN         NOT NULL,
    cached_at       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ     NOT NULL,

    PRIMARY KEY (user_id, relation, object_type, object_id)
);

-- Cleanup expired cache entries (run every 5 min)
CREATE INDEX idx_perm_cache_expires ON permission_cache (expires_at);
-- Tenant-scoped lookups
CREATE INDEX idx_perm_cache_tenant ON permission_cache (tenant_id, user_id);
