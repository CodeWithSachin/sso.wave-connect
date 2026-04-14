-- Migration 000003: Core Identity Tables
-- Source: database-schema-v2.sql, Section 1 (Lines 130-277)
-- Tables: tenants, tenant_policies, users, password_history, memberships + triggers

-- ============================================================================
-- 1.1 TENANTS
-- ============================================================================
-- [FIX-1] UUID PK + typeid_prefix generated column for API serialization.
-- [FIX-3] version column for optimistic locking on admin edits.

CREATE TABLE tenants (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    typeid_prefix       VARCHAR(4)      NOT NULL DEFAULT 'ten',   -- For TypeID serialization in app layer
    name                VARCHAR(255)    NOT NULL,
    slug                VARCHAR(100)    NOT NULL,
    display_name        VARCHAR(255),
    domain              VARCHAR(255),
    logo_url            TEXT,
    favicon_url         TEXT,
    plan                tenant_plan     NOT NULL DEFAULT 'free',
    data_residency      data_residency  NOT NULL DEFAULT 'global',
    openfga_store_id    VARCHAR(100),       -- Per-tenant OpenFGA store (tenant isolation)
    openfga_model_id    VARCHAR(100),       -- [GAP-2] Current auth model version for this tenant
    settings            JSONB           NOT NULL DEFAULT '{}',
    metadata            JSONB           NOT NULL DEFAULT '{}',
    max_users           INTEGER         NOT NULL DEFAULT 50,
    max_apps            INTEGER         NOT NULL DEFAULT 5,
    is_active           BOOLEAN         NOT NULL DEFAULT TRUE,
    version             INTEGER         NOT NULL DEFAULT 1,       -- [FIX-3] Optimistic locking
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,

    CONSTRAINT uq_tenants_slug      UNIQUE (slug),
    CONSTRAINT uq_tenants_domain    UNIQUE (domain),
    CONSTRAINT ck_tenants_slug      CHECK (slug ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'),
    CONSTRAINT ck_tenants_max_users CHECK (max_users > 0),
    CONSTRAINT ck_tenants_max_apps  CHECK (max_apps > 0)
);

CREATE TRIGGER trg_tenants_updated_at
    BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


-- ============================================================================
-- 1.2 TENANT POLICIES
-- ============================================================================

CREATE TABLE tenant_policies (
    id                      UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID            NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    password_min_length     SMALLINT        NOT NULL DEFAULT 12,
    password_require_upper  BOOLEAN         NOT NULL DEFAULT TRUE,
    password_require_lower  BOOLEAN         NOT NULL DEFAULT TRUE,
    password_require_number BOOLEAN         NOT NULL DEFAULT TRUE,
    password_require_symbol BOOLEAN         NOT NULL DEFAULT FALSE,
    password_require_mfa    BOOLEAN         NOT NULL DEFAULT FALSE,
    allowed_mfa_methods     mfa_method[]    NOT NULL DEFAULT '{totp, webauthn}',
    session_max_age_hours   SMALLINT        NOT NULL DEFAULT 24,
    idle_timeout_minutes    SMALLINT        NOT NULL DEFAULT 60,
    ip_allowlist            CIDR[]          DEFAULT '{}',
    allowed_email_domains   TEXT[]          DEFAULT '{}',
    require_sso             BOOLEAN         NOT NULL DEFAULT FALSE,
    max_sessions_per_user   SMALLINT        NOT NULL DEFAULT 10,
    password_history_count  SMALLINT        NOT NULL DEFAULT 5,
    lockout_threshold       SMALLINT        NOT NULL DEFAULT 5,
    lockout_duration_min    SMALLINT        NOT NULL DEFAULT 30,
    version                 INTEGER         NOT NULL DEFAULT 1,   -- [FIX-3]
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_tenant_policies_tenant UNIQUE (tenant_id),
    CONSTRAINT ck_password_min CHECK (password_min_length BETWEEN 8 AND 128),
    CONSTRAINT ck_session_max_age CHECK (session_max_age_hours BETWEEN 1 AND 720),
    CONSTRAINT ck_idle_timeout CHECK (idle_timeout_minutes > 0)
);

CREATE TRIGGER trg_tenant_policies_updated_at
    BEFORE UPDATE ON tenant_policies
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


-- ============================================================================
-- 1.3 USERS
-- ============================================================================

CREATE TABLE users (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    email               CITEXT          NOT NULL,
    email_verified      BOOLEAN         NOT NULL DEFAULT FALSE,
    password_hash       VARCHAR(255),
    display_name        VARCHAR(255)    NOT NULL,
    first_name          VARCHAR(128),
    last_name           VARCHAR(128),
    avatar_url          TEXT,
    phone_number        VARCHAR(20),
    phone_verified      BOOLEAN         NOT NULL DEFAULT FALSE,
    locale              VARCHAR(10)     DEFAULT 'en',
    timezone            VARCHAR(50)     DEFAULT 'UTC',
    status              user_status     NOT NULL DEFAULT 'pending_verification',
    metadata            JSONB           NOT NULL DEFAULT '{}',
    last_login_at       TIMESTAMPTZ,
    last_login_ip       INET,
    failed_login_count  SMALLINT        NOT NULL DEFAULT 0,
    locked_until        TIMESTAMPTZ,
    password_changed_at TIMESTAMPTZ,
    version             INTEGER         NOT NULL DEFAULT 1,       -- [FIX-3]
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,

    CONSTRAINT uq_users_email UNIQUE (email),
    CONSTRAINT ck_users_email CHECK (email ~ '^[^@]+@[^@]+\.[^@]+$')
);

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


-- ============================================================================
-- 1.4 PASSWORD HISTORY
-- ============================================================================

CREATE TABLE password_history (
    id                  BIGSERIAL       PRIMARY KEY,
    user_id             UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    password_hash       VARCHAR(255)    NOT NULL,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);


-- ============================================================================
-- 1.5 MEMBERSHIPS
-- ============================================================================
-- [FIX-2] Composite PK alternative: (tenant_id, user_id) for locality.

CREATE TABLE memberships (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id           UUID            NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    role                membership_role NOT NULL DEFAULT 'member',
    invited_by          UUID            REFERENCES users(id) ON DELETE SET NULL,
    invitation_token    VARCHAR(255),
    invitation_expires  TIMESTAMPTZ,
    joined_at           TIMESTAMPTZ,
    created_by          UUID,                                     -- [FIX-14] Who created this
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,

    CONSTRAINT uq_memberships_user_tenant UNIQUE (tenant_id, user_id)  -- [FIX-2] tenant_id FIRST
);

CREATE TRIGGER trg_memberships_updated_at
    BEFORE UPDATE ON memberships
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
