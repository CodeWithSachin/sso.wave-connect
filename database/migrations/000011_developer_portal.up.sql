-- Migration 000011: Developer Portal
-- Source: database-schema-v2.sql, Section 9 (Lines 807-875)
-- Tables: api_keys, api_key_usage, scim_tokens, scim_sync_log

CREATE TABLE api_keys (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID            NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id             UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name                VARCHAR(255)    NOT NULL,
    key_prefix          VARCHAR(12)     NOT NULL,
    key_hash            VARCHAR(255)    NOT NULL,
    status              api_key_status  NOT NULL DEFAULT 'active',
    scopes              TEXT[]          NOT NULL DEFAULT '{}',
    allowed_ips         CIDR[]          DEFAULT '{}',
    rate_limit_per_min  INTEGER         DEFAULT 1000,
    last_used_at        TIMESTAMPTZ,
    expires_at          TIMESTAMPTZ,
    revoked_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_api_keys_prefix UNIQUE (key_prefix),
    CONSTRAINT ck_rate_limit CHECK (rate_limit_per_min > 0)
);


CREATE TABLE api_key_usage (
    id                  BIGSERIAL       PRIMARY KEY,
    api_key_id          UUID            NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    tenant_id           UUID            NOT NULL,
    date                DATE            NOT NULL,
    request_count       BIGINT          NOT NULL DEFAULT 0,
    error_count         BIGINT          NOT NULL DEFAULT 0,
    avg_latency_ms      NUMERIC(10,2)   DEFAULT 0,
    p99_latency_ms      NUMERIC(10,2)   DEFAULT 0,
    bandwidth_bytes     BIGINT          DEFAULT 0,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_api_key_usage_daily UNIQUE (api_key_id, date)
);


CREATE TABLE scim_tokens (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID            NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    token_hash          VARCHAR(255)    NOT NULL,
    token_prefix        VARCHAR(12)     NOT NULL,
    label               VARCHAR(255),
    is_active           BOOLEAN         NOT NULL DEFAULT TRUE,
    last_used_at        TIMESTAMPTZ,
    expires_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_scim_tokens_hash UNIQUE (token_hash)
);


-- [FIX-6] idempotency_key prevents duplicate SCIM provisions on retry
CREATE TABLE scim_sync_log (
    id                  BIGSERIAL       PRIMARY KEY,
    tenant_id           UUID            NOT NULL,
    idp_id              UUID,
    idempotency_key     VARCHAR(255),                             -- [FIX-6]
    operation           VARCHAR(20)     NOT NULL,
    resource_type       VARCHAR(20)     NOT NULL,
    external_id         VARCHAR(500),
    internal_id         UUID,
    status              VARCHAR(20)     NOT NULL,
    error_message       TEXT,
    request_payload     JSONB,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_scim_idempotency UNIQUE (tenant_id, idempotency_key)  -- [FIX-6]
);
