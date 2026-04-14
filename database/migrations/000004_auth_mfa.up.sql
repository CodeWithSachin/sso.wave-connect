-- Migration 000004: Authentication & MFA
-- Source: database-schema-v2.sql, Section 2 (Lines 288-352)
-- Tables: mfa_enrollments, mfa_backup_codes, sessions (WITH fillfactor=80) + triggers

-- ============================================================================
-- 2.1 MFA ENROLLMENTS
-- ============================================================================

CREATE TABLE mfa_enrollments (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    method              mfa_method      NOT NULL,
    status              mfa_status      NOT NULL DEFAULT 'pending_setup',
    secret_encrypted    TEXT,
    credential_id       TEXT,
    public_key          TEXT,
    sign_count          BIGINT          DEFAULT 0,
    transports          TEXT[],
    phone_number        VARCHAR(20),
    is_default          BOOLEAN         NOT NULL DEFAULT FALSE,
    last_used_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_mfa_user_method_cred UNIQUE (user_id, method, credential_id)
);

CREATE TRIGGER trg_mfa_enrollments_updated_at
    BEFORE UPDATE ON mfa_enrollments
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


-- ============================================================================
-- 2.2 MFA BACKUP CODES
-- ============================================================================

CREATE TABLE mfa_backup_codes (
    id                  BIGSERIAL       PRIMARY KEY,
    user_id             UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash           VARCHAR(255)    NOT NULL,
    used_at             TIMESTAMPTZ,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);


-- ============================================================================
-- 2.3 SESSIONS
-- ============================================================================
-- [FIX-4] FILLFACTOR 80 -- sessions.last_activity_at updates frequently.
--         Lower fillfactor leaves room on each page for HOT (Heap-Only Tuple)
--         updates, which avoid index maintenance on non-indexed column changes.

CREATE TABLE sessions (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id           UUID            NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    token_hash          VARCHAR(255)    NOT NULL,
    status              session_status  NOT NULL DEFAULT 'active',
    ip_address          INET,
    user_agent          TEXT,
    device_fingerprint  VARCHAR(255),
    country_code        CHAR(2),
    city                VARCHAR(100),
    mfa_verified        BOOLEAN         NOT NULL DEFAULT FALSE,
    mfa_method_used     mfa_method,
    last_activity_at    TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    expires_at          TIMESTAMPTZ     NOT NULL,
    revoked_at          TIMESTAMPTZ,
    revoke_reason       VARCHAR(100),
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_sessions_token_hash UNIQUE (token_hash)
) WITH (fillfactor = 80);                                         -- [FIX-4]
