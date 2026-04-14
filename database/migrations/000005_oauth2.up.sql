-- Migration 000005: OAuth2 / OIDC
-- Source: database-schema-v2.sql, Section 3 (Lines 363-481)
-- Tables: oauth_clients, oauth_client_secrets, user_consents, token_deny_list (UNLOGGED, fillfactor=70),
--         refresh_token_families (fillfactor=80) + triggers

-- ============================================================================
-- 3.1 OAUTH CLIENTS
-- ============================================================================

CREATE TABLE oauth_clients (
    id                          UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                   UUID            NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    client_id                   VARCHAR(255)    NOT NULL,
    client_secret_hash          VARCHAR(255),
    name                        VARCHAR(255)    NOT NULL,
    description                 TEXT,
    logo_url                    TEXT,
    homepage_url                TEXT,
    privacy_policy_url          TEXT,
    terms_of_service_url        TEXT,
    redirect_uris               TEXT[]          NOT NULL,
    post_logout_redirect_uris   TEXT[]          DEFAULT '{}',
    allowed_grant_types         oauth_grant_type[] NOT NULL DEFAULT '{authorization_code, refresh_token}',
    allowed_scopes              TEXT[]          NOT NULL DEFAULT '{openid, profile, email}',
    token_endpoint_auth_method  token_auth_method NOT NULL DEFAULT 'client_secret_basic',
    access_token_ttl_seconds    INTEGER         NOT NULL DEFAULT 900,
    refresh_token_ttl_seconds   INTEGER         NOT NULL DEFAULT 2592000,
    id_token_ttl_seconds        INTEGER         NOT NULL DEFAULT 3600,
    is_first_party              BOOLEAN         NOT NULL DEFAULT FALSE,
    is_public                   BOOLEAN         NOT NULL DEFAULT FALSE,
    require_pkce                BOOLEAN         NOT NULL DEFAULT TRUE,
    require_consent             BOOLEAN         NOT NULL DEFAULT TRUE,
    is_active                   BOOLEAN         NOT NULL DEFAULT TRUE,
    metadata                    JSONB           NOT NULL DEFAULT '{}',
    version                     INTEGER         NOT NULL DEFAULT 1,   -- [FIX-3]
    created_at                  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    deleted_at                  TIMESTAMPTZ,

    CONSTRAINT uq_oauth_clients_client_id UNIQUE (client_id),
    CONSTRAINT ck_access_token_ttl CHECK (access_token_ttl_seconds BETWEEN 60 AND 86400),
    CONSTRAINT ck_refresh_token_ttl CHECK (refresh_token_ttl_seconds BETWEEN 3600 AND 31536000)
);

CREATE TRIGGER trg_oauth_clients_updated_at
    BEFORE UPDATE ON oauth_clients
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


-- ============================================================================
-- 3.2 OAUTH CLIENT SECRETS (Rotatable)
-- ============================================================================

CREATE TABLE oauth_client_secrets (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id           UUID            NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE,
    secret_hash         VARCHAR(255)    NOT NULL,
    secret_prefix       VARCHAR(8)      NOT NULL,
    label               VARCHAR(100),
    is_active           BOOLEAN         NOT NULL DEFAULT TRUE,
    expires_at          TIMESTAMPTZ,
    last_used_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_client_secrets_prefix UNIQUE (client_id, secret_prefix)
);


-- ============================================================================
-- 3.3 USER CONSENTS
-- ============================================================================

CREATE TABLE user_consents (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id           UUID            NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE,
    tenant_id           UUID            NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    granted_scopes      TEXT[]          NOT NULL,
    status              consent_status  NOT NULL DEFAULT 'granted',
    granted_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    revoked_at          TIMESTAMPTZ,
    expires_at          TIMESTAMPTZ,
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_user_consents UNIQUE (tenant_id, user_id, client_id)  -- [FIX-2] tenant_id FIRST
);

CREATE TRIGGER trg_user_consents_updated_at
    BEFORE UPDATE ON user_consents
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


-- ============================================================================
-- 3.4 TOKEN DENY LIST
-- ============================================================================
-- [FIX-12] UNLOGGED -- this is an ephemeral cache. Redis is the primary deny-list.
--          Postgres is the durable fallback. Not surviving a crash is acceptable
--          because tokens also have built-in expiry and Redis has the same data.
-- [FIX-4]  FILLFACTOR 70 -- high churn table, rows inserted then deleted when expired.

CREATE UNLOGGED TABLE token_deny_list (                            -- [FIX-12]
    jti                 VARCHAR(64)     PRIMARY KEY,
    token_type          VARCHAR(20)     NOT NULL,
    user_id             UUID,
    tenant_id           UUID,
    reason              VARCHAR(100),
    expires_at          TIMESTAMPTZ     NOT NULL,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
) WITH (fillfactor = 70);                                          -- [FIX-4]


-- ============================================================================
-- 3.5 REFRESH TOKEN FAMILIES
-- ============================================================================

CREATE TABLE refresh_token_families (
    family_id           VARCHAR(64)     PRIMARY KEY,
    user_id             UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id           UUID            NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    client_id           UUID            NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE,
    current_jti         VARCHAR(64)     NOT NULL,
    generation          INTEGER         NOT NULL DEFAULT 1,
    is_revoked          BOOLEAN         NOT NULL DEFAULT FALSE,
    revoked_reason      VARCHAR(100),
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    last_rotated_at     TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    expires_at          TIMESTAMPTZ     NOT NULL
) WITH (fillfactor = 80);                                          -- [FIX-4] current_jti updates often
