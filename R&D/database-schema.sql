-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  SSO Platform — Production-Grade PostgreSQL Schema                         ║
-- ║  Relationship-Based Access Control (ReBAC) with OpenFGA                    ║
-- ║                                                                            ║
-- ║  Design Principles:                                                        ║
-- ║    • TypeID (UUIDv7-based) for all PKs — K-sortable, type-prefixed        ║
-- ║    • PASETO v4 tokens — self-contained, no opaque UUID bearer tokens      ║
-- ║    • Multi-tenant with Row-Level Security (RLS)                           ║
-- ║    • Partitioned tables for high-volume data (audit_logs, events)         ║
-- ║    • Partial indexes for hot queries                                       ║
-- ║    • JSONB for flexible, schema-evolving metadata                         ║
-- ║    • Soft-delete pattern (deleted_at) for compliance/recovery             ║
-- ║    • Immutable audit trail (append-only)                                  ║
-- ║                                                                            ║
-- ║  ID Convention:                                                            ║
-- ║    TypeID format: {prefix}_{crockford_base32_uuidv7}                      ║
-- ║    Examples: user_01h2xcejqtf2nbrexx3vqjhp41                              ║
-- ║             ten_01h2xcejqtf2nbrexx3vqjhp41                                ║
-- ║    Stored as VARCHAR(90) — accommodates prefix + separator + 26-char ID   ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

-- ============================================================================
-- 0. EXTENSIONS & PREREQUISITES
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";       -- gen_random_bytes for crypto ops
CREATE EXTENSION IF NOT EXISTS "citext";         -- Case-insensitive text for emails
CREATE EXTENSION IF NOT EXISTS "btree_gist";     -- GiST indexes for exclusion constraints
CREATE EXTENSION IF NOT EXISTS "pg_trgm";        -- Trigram indexes for fuzzy search

-- ============================================================================
-- 0.1 SHARED FUNCTIONS
-- ============================================================================

-- Auto-update updated_at on row modification
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Prevent UPDATE/DELETE on append-only tables
CREATE OR REPLACE FUNCTION trigger_prevent_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Mutations are not allowed on append-only table %', TG_TABLE_NAME;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 0.2 ENUM TYPES (preferred over VARCHAR check constraints for safety + speed)
-- ============================================================================

CREATE TYPE tenant_plan         AS ENUM ('free', 'starter', 'pro', 'enterprise');
CREATE TYPE user_status         AS ENUM ('active', 'suspended', 'deactivated', 'pending_verification');
CREATE TYPE membership_role     AS ENUM ('owner', 'admin', 'member', 'billing_manager', 'readonly');
CREATE TYPE idp_type            AS ENUM ('saml', 'oidc', 'social_google', 'social_github', 'social_microsoft');
CREATE TYPE idp_status          AS ENUM ('active', 'inactive', 'pending_verification');
CREATE TYPE oauth_grant_type    AS ENUM ('authorization_code', 'refresh_token', 'client_credentials', 'device_code');
CREATE TYPE token_auth_method   AS ENUM ('client_secret_basic', 'client_secret_post', 'private_key_jwt', 'none');
CREATE TYPE mfa_method          AS ENUM ('totp', 'webauthn', 'backup_code', 'sms', 'email');
CREATE TYPE mfa_status          AS ENUM ('pending_setup', 'active', 'disabled');
CREATE TYPE webhook_event_type  AS ENUM (
    'user.created', 'user.updated', 'user.deleted', 'user.login', 'user.logout',
    'user.mfa_enrolled', 'user.mfa_removed', 'user.password_changed',
    'membership.created', 'membership.updated', 'membership.deleted',
    'group.created', 'group.updated', 'group.deleted',
    'group.member_added', 'group.member_removed',
    'permission.granted', 'permission.revoked',
    'session.created', 'session.revoked',
    'app.created', 'app.updated', 'app.deleted',
    'idp.created', 'idp.updated', 'idp.deleted',
    'tenant.updated', 'tenant.plan_changed'
);
CREATE TYPE webhook_delivery_status AS ENUM ('pending', 'success', 'failed', 'retrying');
CREATE TYPE api_key_status      AS ENUM ('active', 'revoked', 'expired');
CREATE TYPE session_status      AS ENUM ('active', 'expired', 'revoked');
CREATE TYPE consent_status      AS ENUM ('granted', 'revoked');
CREATE TYPE data_residency      AS ENUM ('us', 'eu', 'ap', 'global');
CREATE TYPE audit_actor_type    AS ENUM ('user', 'system', 'api_key', 'scim_token', 'service');


-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  SECTION 1: CORE IDENTITY TABLES                                           ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

-- ============================================================================
-- 1.1 TENANTS (Organizations)
-- ============================================================================
-- Each tenant is an isolated organization. The root entity for multi-tenancy.
-- OpenFGA store isolation: every tenant gets its own OpenFGA store_id.

CREATE TABLE tenants (
    id                  VARCHAR(90)     PRIMARY KEY,              -- TypeID: ten_01h2xcej...
    name                VARCHAR(255)    NOT NULL,
    slug                VARCHAR(100)    NOT NULL,
    display_name        VARCHAR(255),
    domain              VARCHAR(255),                             -- Custom domain: auth.acme.com
    logo_url            TEXT,
    favicon_url         TEXT,
    plan                tenant_plan     NOT NULL DEFAULT 'free',
    data_residency      data_residency  NOT NULL DEFAULT 'global',
    openfga_store_id    VARCHAR(100),                             -- Isolated OpenFGA store per tenant
    settings            JSONB           NOT NULL DEFAULT '{}',    -- Flexible tenant-level config
    metadata            JSONB           NOT NULL DEFAULT '{}',    -- Customer-managed metadata
    max_users           INTEGER         DEFAULT 50,               -- Plan-based limit
    max_apps            INTEGER         DEFAULT 5,
    is_active           BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,                              -- Soft delete

    -- Constraints
    CONSTRAINT uq_tenants_slug      UNIQUE (slug),
    CONSTRAINT uq_tenants_domain    UNIQUE (domain),
    CONSTRAINT ck_tenants_slug      CHECK (slug ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'),  -- URL-safe slugs
    CONSTRAINT ck_tenants_max_users CHECK (max_users > 0),
    CONSTRAINT ck_tenants_max_apps  CHECK (max_apps > 0)
);

COMMENT ON TABLE  tenants IS 'Root multi-tenancy entity. Each org gets isolated users, apps, policies, and an OpenFGA store.';
COMMENT ON COLUMN tenants.id IS 'TypeID: ten_{crockford_base32_uuidv7} — K-sortable, type-safe.';
COMMENT ON COLUMN tenants.openfga_store_id IS 'Each tenant gets a dedicated OpenFGA store for authorization isolation.';
COMMENT ON COLUMN tenants.settings IS 'JSONB for branding (colors, login page), feature flags, custom policies.';

CREATE TRIGGER trg_tenants_updated_at
    BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


-- ============================================================================
-- 1.2 TENANT POLICIES (Organization-Level Security Policies)
-- ============================================================================
-- Separated from tenants to avoid wide-row bloat and allow policy versioning.

CREATE TABLE tenant_policies (
    id                      VARCHAR(90)     PRIMARY KEY,          -- TypeID: tpol_...
    tenant_id               VARCHAR(90)     NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    password_min_length     SMALLINT        NOT NULL DEFAULT 12,
    password_require_upper  BOOLEAN         NOT NULL DEFAULT TRUE,
    password_require_lower  BOOLEAN         NOT NULL DEFAULT TRUE,
    password_require_number BOOLEAN         NOT NULL DEFAULT TRUE,
    password_require_symbol BOOLEAN         NOT NULL DEFAULT FALSE,
    password_require_mfa    BOOLEAN         NOT NULL DEFAULT FALSE,
    allowed_mfa_methods     mfa_method[]    NOT NULL DEFAULT '{totp, webauthn}',
    session_max_age_hours   SMALLINT        NOT NULL DEFAULT 24,
    idle_timeout_minutes    SMALLINT        NOT NULL DEFAULT 60,
    ip_allowlist            CIDR[]          DEFAULT '{}',         -- Restrict login to IP ranges
    allowed_email_domains   TEXT[]          DEFAULT '{}',         -- e.g., {'@acme.com', '@acme.io'}
    require_sso             BOOLEAN         NOT NULL DEFAULT FALSE,
    max_sessions_per_user   SMALLINT        NOT NULL DEFAULT 10,
    password_history_count  SMALLINT        NOT NULL DEFAULT 5,   -- Prevent reuse of last N passwords
    lockout_threshold       SMALLINT        NOT NULL DEFAULT 5,   -- Failed attempts before lockout
    lockout_duration_min    SMALLINT        NOT NULL DEFAULT 30,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_tenant_policies_tenant UNIQUE (tenant_id),
    CONSTRAINT ck_password_min CHECK (password_min_length >= 8 AND password_min_length <= 128),
    CONSTRAINT ck_session_max_age CHECK (session_max_age_hours > 0 AND session_max_age_hours <= 720),
    CONSTRAINT ck_idle_timeout CHECK (idle_timeout_minutes > 0)
);

COMMENT ON TABLE tenant_policies IS 'Per-tenant security policies. Enforced by Go middleware on every auth request.';

CREATE TRIGGER trg_tenant_policies_updated_at
    BEFORE UPDATE ON tenant_policies
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


-- ============================================================================
-- 1.3 USERS
-- ============================================================================
-- Global user table. A user can belong to multiple tenants via memberships.
-- Email is globally unique (citext for case-insensitive matching).

CREATE TABLE users (
    id                  VARCHAR(90)     PRIMARY KEY,              -- TypeID: user_01h2xcej...
    email               CITEXT          NOT NULL,
    email_verified      BOOLEAN         NOT NULL DEFAULT FALSE,
    password_hash       VARCHAR(255),                             -- NULL for SSO-only users (Argon2id)
    display_name        VARCHAR(255)    NOT NULL,
    first_name          VARCHAR(128),
    last_name           VARCHAR(128),
    avatar_url          TEXT,
    phone_number        VARCHAR(20),
    phone_verified      BOOLEAN         NOT NULL DEFAULT FALSE,
    locale              VARCHAR(10)     DEFAULT 'en',             -- IETF BCP 47
    timezone            VARCHAR(50)     DEFAULT 'UTC',            -- IANA timezone
    status              user_status     NOT NULL DEFAULT 'pending_verification',
    metadata            JSONB           NOT NULL DEFAULT '{}',    -- Customer-managed profile metadata
    last_login_at       TIMESTAMPTZ,
    last_login_ip       INET,
    failed_login_count  SMALLINT        NOT NULL DEFAULT 0,
    locked_until        TIMESTAMPTZ,                              -- Account lockout expiry
    password_changed_at TIMESTAMPTZ,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,                              -- Soft delete (GDPR)

    CONSTRAINT uq_users_email UNIQUE (email),
    CONSTRAINT ck_users_email CHECK (email ~ '^[^@]+@[^@]+\.[^@]+$')
);

COMMENT ON TABLE  users IS 'Global user accounts. A user can belong to many tenants via memberships.';
COMMENT ON COLUMN users.password_hash IS 'Argon2id hash. NULL when user authenticates exclusively via SSO/social.';
COMMENT ON COLUMN users.metadata IS 'Extensible profile data: custom attributes synced from IdPs or set via SCIM.';

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


-- ============================================================================
-- 1.4 PASSWORD HISTORY (Prevent Reuse)
-- ============================================================================

CREATE TABLE password_history (
    id                  BIGSERIAL       PRIMARY KEY,
    user_id             VARCHAR(90)     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    password_hash       VARCHAR(255)    NOT NULL,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE password_history IS 'Stores previous password hashes to prevent reuse (configurable via tenant_policies.password_history_count).';


-- ============================================================================
-- 1.5 MEMBERSHIPS (User ↔ Tenant Join)
-- ============================================================================
-- Links users to tenants with a role. One user can belong to many orgs.
-- Also writes an OpenFGA tuple: user:{user_id} → {role} → organization:{tenant_id}

CREATE TABLE memberships (
    id                  VARCHAR(90)     PRIMARY KEY,              -- TypeID: mem_...
    user_id             VARCHAR(90)     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id           VARCHAR(90)     NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    role                membership_role NOT NULL DEFAULT 'member',
    invited_by          VARCHAR(90)     REFERENCES users(id) ON DELETE SET NULL,
    invitation_token    VARCHAR(255),                             -- For pending invitations
    invitation_expires  TIMESTAMPTZ,
    joined_at           TIMESTAMPTZ,                              -- NULL until invitation accepted
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,

    CONSTRAINT uq_memberships_user_tenant UNIQUE (user_id, tenant_id)
);

COMMENT ON TABLE memberships IS 'User-Tenant join. Every write here should also write an OpenFGA tuple.';

CREATE TRIGGER trg_memberships_updated_at
    BEFORE UPDATE ON memberships
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  SECTION 2: AUTHENTICATION & MFA                                           ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

-- ============================================================================
-- 2.1 MFA ENROLLMENTS
-- ============================================================================
-- Tracks which MFA methods a user has enrolled. Secrets encrypted via Vault.

CREATE TABLE mfa_enrollments (
    id                  VARCHAR(90)     PRIMARY KEY,              -- TypeID: mfa_...
    user_id             VARCHAR(90)     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    method              mfa_method      NOT NULL,
    status              mfa_status      NOT NULL DEFAULT 'pending_setup',
    secret_encrypted    TEXT,                                     -- Vault-encrypted TOTP secret
    credential_id       TEXT,                                     -- WebAuthn credential ID
    public_key          TEXT,                                     -- WebAuthn public key (CBOR)
    sign_count          BIGINT          DEFAULT 0,                -- WebAuthn sign counter
    transports          TEXT[],                                   -- WebAuthn transports ['usb','ble','nfc','internal']
    phone_number        VARCHAR(20),                              -- For SMS method
    is_default          BOOLEAN         NOT NULL DEFAULT FALSE,
    last_used_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_mfa_user_method_credential UNIQUE (user_id, method, credential_id)
);

COMMENT ON TABLE mfa_enrollments IS 'MFA method enrollments per user. Supports TOTP, WebAuthn/Passkeys, SMS, email, backup codes.';

CREATE TRIGGER trg_mfa_enrollments_updated_at
    BEFORE UPDATE ON mfa_enrollments
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


-- ============================================================================
-- 2.2 MFA BACKUP CODES (One-Time Use Recovery Codes)
-- ============================================================================

CREATE TABLE mfa_backup_codes (
    id                  BIGSERIAL       PRIMARY KEY,
    user_id             VARCHAR(90)     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash           VARCHAR(255)    NOT NULL,                 -- bcrypt hash of the backup code
    used_at             TIMESTAMPTZ,                              -- NULL = available, timestamp = consumed
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE mfa_backup_codes IS 'One-time-use recovery codes. 10 codes generated at MFA enrollment. Hashed, not stored plaintext.';


-- ============================================================================
-- 2.3 SESSIONS
-- ============================================================================
-- Lightweight session records for server-side revocation and audit.
-- Actual session data lives inside PASETO v4.local tokens (self-contained).

CREATE TABLE sessions (
    id                  VARCHAR(90)     PRIMARY KEY,              -- TypeID: ses_...
    user_id             VARCHAR(90)     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id           VARCHAR(90)     NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    token_hash          VARCHAR(255)    NOT NULL,                 -- SHA-256 hash of PASETO session token
    status              session_status  NOT NULL DEFAULT 'active',
    ip_address          INET,
    user_agent          TEXT,
    device_fingerprint  VARCHAR(255),                             -- Optional browser fingerprint
    country_code        CHAR(2),                                  -- GeoIP country
    city                VARCHAR(100),
    mfa_verified        BOOLEAN         NOT NULL DEFAULT FALSE,
    mfa_method_used     mfa_method,
    last_activity_at    TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    expires_at          TIMESTAMPTZ     NOT NULL,
    revoked_at          TIMESTAMPTZ,
    revoke_reason       VARCHAR(100),                             -- 'logout', 'admin_revoke', 'password_change', 'policy_violation'
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_sessions_token_hash UNIQUE (token_hash)
);

COMMENT ON TABLE sessions IS 'Server-side session records for revocation/audit. Session payload lives inside PASETO tokens.';
COMMENT ON COLUMN sessions.token_hash IS 'SHA-256 of the PASETO v4.local session token. Never store the raw token.';


-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  SECTION 3: OAUTH2 / OIDC                                                 ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

-- ============================================================================
-- 3.1 OAUTH CLIENTS (Applications Connected to SSO)
-- ============================================================================

CREATE TABLE oauth_clients (
    id                          VARCHAR(90)     PRIMARY KEY,      -- TypeID: app_...
    tenant_id                   VARCHAR(90)     NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    client_id                   VARCHAR(255)    NOT NULL,         -- Public client identifier
    client_secret_hash          VARCHAR(255),                     -- Argon2id hash (NULL for public clients)
    name                        VARCHAR(255)    NOT NULL,
    description                 TEXT,
    logo_url                    TEXT,
    homepage_url                TEXT,
    privacy_policy_url          TEXT,
    terms_of_service_url        TEXT,
    redirect_uris               TEXT[]          NOT NULL,         -- Validated on authorize
    post_logout_redirect_uris   TEXT[]          DEFAULT '{}',
    allowed_grant_types         oauth_grant_type[] NOT NULL DEFAULT '{authorization_code, refresh_token}',
    allowed_scopes              TEXT[]          NOT NULL DEFAULT '{openid, profile, email}',
    token_endpoint_auth_method  token_auth_method NOT NULL DEFAULT 'client_secret_basic',
    access_token_ttl_seconds    INTEGER         NOT NULL DEFAULT 900,    -- 15 min
    refresh_token_ttl_seconds   INTEGER         NOT NULL DEFAULT 2592000, -- 30 days
    id_token_ttl_seconds        INTEGER         NOT NULL DEFAULT 3600,   -- 1 hour
    is_first_party              BOOLEAN         NOT NULL DEFAULT FALSE,  -- Skip consent screen
    is_public                   BOOLEAN         NOT NULL DEFAULT FALSE,  -- SPA/mobile (no secret)
    require_pkce                BOOLEAN         NOT NULL DEFAULT TRUE,
    require_consent             BOOLEAN         NOT NULL DEFAULT TRUE,
    is_active                   BOOLEAN         NOT NULL DEFAULT TRUE,
    metadata                    JSONB           NOT NULL DEFAULT '{}',
    created_at                  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    deleted_at                  TIMESTAMPTZ,

    CONSTRAINT uq_oauth_clients_client_id UNIQUE (client_id),
    CONSTRAINT ck_access_token_ttl CHECK (access_token_ttl_seconds BETWEEN 60 AND 86400),
    CONSTRAINT ck_refresh_token_ttl CHECK (refresh_token_ttl_seconds BETWEEN 3600 AND 31536000)
);

COMMENT ON TABLE oauth_clients IS 'OAuth2/OIDC applications registered per tenant. First-party apps skip consent flow.';

CREATE TRIGGER trg_oauth_clients_updated_at
    BEFORE UPDATE ON oauth_clients
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


-- ============================================================================
-- 3.2 OAUTH CLIENT SECRETS (Rotatable, Multiple Active)
-- ============================================================================
-- Supports zero-downtime secret rotation by allowing multiple active secrets.

CREATE TABLE oauth_client_secrets (
    id                  VARCHAR(90)     PRIMARY KEY,              -- TypeID: csec_...
    client_id           VARCHAR(90)     NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE,
    secret_hash         VARCHAR(255)    NOT NULL,                 -- Argon2id hash
    secret_prefix       VARCHAR(8)      NOT NULL,                 -- First 8 chars for identification
    label               VARCHAR(100),                             -- "Production Key", "Staging Key"
    is_active           BOOLEAN         NOT NULL DEFAULT TRUE,
    expires_at          TIMESTAMPTZ,
    last_used_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_client_secrets_prefix UNIQUE (client_id, secret_prefix)
);

COMMENT ON TABLE oauth_client_secrets IS 'Supports multiple active secrets per client for zero-downtime rotation.';


-- ============================================================================
-- 3.3 USER CONSENTS (Granted OAuth Scopes)
-- ============================================================================

CREATE TABLE user_consents (
    id                  VARCHAR(90)     PRIMARY KEY,              -- TypeID: con_...
    user_id             VARCHAR(90)     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id           VARCHAR(90)     NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE,
    tenant_id           VARCHAR(90)     NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    granted_scopes      TEXT[]          NOT NULL,
    status              consent_status  NOT NULL DEFAULT 'granted',
    granted_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    revoked_at          TIMESTAMPTZ,
    expires_at          TIMESTAMPTZ,
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_user_consents UNIQUE (user_id, client_id, tenant_id)
);

COMMENT ON TABLE user_consents IS 'Tracks which scopes a user has granted to each OAuth client.';

CREATE TRIGGER trg_user_consents_updated_at
    BEFORE UPDATE ON user_consents
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


-- ============================================================================
-- 3.4 TOKEN DENY LIST (Revoked PASETO JTIs)
-- ============================================================================
-- Short-lived entries. When a PASETO token is revoked, its JTI goes here.
-- Also backed by Redis for sub-ms checks; Postgres is the durable fallback.

CREATE TABLE token_deny_list (
    jti                 VARCHAR(64)     PRIMARY KEY,              -- Crypto-random token ID from PASETO
    token_type          VARCHAR(20)     NOT NULL,                 -- 'access', 'refresh', 'auth_code'
    user_id             VARCHAR(90),
    tenant_id           VARCHAR(90),
    reason              VARCHAR(100),                             -- 'logout', 'rotation', 'admin_revoke', 'replay_detected'
    expires_at          TIMESTAMPTZ     NOT NULL,                 -- Auto-cleanup: delete after token would have expired
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE token_deny_list IS 'Durable deny-list for revoked PASETO JTIs. Redis is the hot cache; Postgres is the fallback.';


-- ============================================================================
-- 3.5 REFRESH TOKEN FAMILIES (Rotation & Replay Detection)
-- ============================================================================
-- Tracks token families for refresh token rotation. If a rotated-out token
-- is replayed, the entire family is revoked (stolen token detection).

CREATE TABLE refresh_token_families (
    family_id           VARCHAR(64)     PRIMARY KEY,              -- Crypto-random family ID
    user_id             VARCHAR(90)     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id           VARCHAR(90)     NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    client_id           VARCHAR(90)     NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE,
    current_jti         VARCHAR(64)     NOT NULL,                 -- Latest valid JTI in this family
    generation          INTEGER         NOT NULL DEFAULT 1,       -- Rotation count
    is_revoked          BOOLEAN         NOT NULL DEFAULT FALSE,
    revoked_reason      VARCHAR(100),                             -- 'replay_detected', 'logout', 'admin'
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    last_rotated_at     TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    expires_at          TIMESTAMPTZ     NOT NULL                  -- When the whole family expires
);

COMMENT ON TABLE refresh_token_families IS 'Tracks refresh token rotation chains. Replay of old tokens revokes entire family.';


-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  SECTION 4: IDENTITY PROVIDERS (SAML / OIDC / Social)                     ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

-- ============================================================================
-- 4.1 IDENTITY PROVIDERS
-- ============================================================================

CREATE TABLE identity_providers (
    id                  VARCHAR(90)     PRIMARY KEY,              -- TypeID: idp_...
    tenant_id           VARCHAR(90)     NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name                VARCHAR(255)    NOT NULL,
    type                idp_type        NOT NULL,
    status              idp_status      NOT NULL DEFAULT 'pending_verification',
    domain_hint         VARCHAR(255),                             -- e.g., 'acme.com' — auto-redirect for this domain

    -- SAML-specific config (encrypted at rest)
    saml_entity_id          TEXT,
    saml_sso_url            TEXT,
    saml_slo_url            TEXT,
    saml_certificate        TEXT,                                 -- PEM-encoded X.509 cert (encrypted via Vault)
    saml_signing_algorithm  VARCHAR(20)  DEFAULT 'RSA-SHA256',
    saml_name_id_format     VARCHAR(100) DEFAULT 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',

    -- OIDC-specific config
    oidc_issuer             TEXT,
    oidc_client_id          VARCHAR(255),
    oidc_client_secret_enc  TEXT,                                 -- Vault-encrypted
    oidc_discovery_url      TEXT,
    oidc_scopes             TEXT[]       DEFAULT '{openid, profile, email}',

    -- Attribute mapping (IdP attribute → your system attribute)
    attribute_mapping   JSONB           NOT NULL DEFAULT '{
        "email": "email",
        "firstName": "first_name",
        "lastName": "last_name",
        "displayName": "display_name",
        "groups": "groups"
    }',

    -- Provisioning settings
    jit_provisioning    BOOLEAN         NOT NULL DEFAULT TRUE,    -- Just-In-Time user creation
    auto_sync_groups    BOOLEAN         NOT NULL DEFAULT FALSE,   -- Sync groups from IdP assertions
    default_role        membership_role NOT NULL DEFAULT 'member',

    metadata            JSONB           NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,

    CONSTRAINT uq_idp_tenant_domain UNIQUE (tenant_id, domain_hint)
);

COMMENT ON TABLE identity_providers IS 'SAML/OIDC/Social IdP connections per tenant. Enables enterprise SSO federation.';

CREATE TRIGGER trg_identity_providers_updated_at
    BEFORE UPDATE ON identity_providers
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


-- ============================================================================
-- 4.2 FEDERATED IDENTITIES (User ↔ External IdP Link)
-- ============================================================================
-- Maps users to their external identity at a specific IdP.

CREATE TABLE federated_identities (
    id                  VARCHAR(90)     PRIMARY KEY,              -- TypeID: fid_...
    user_id             VARCHAR(90)     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    idp_id              VARCHAR(90)     NOT NULL REFERENCES identity_providers(id) ON DELETE CASCADE,
    external_user_id    VARCHAR(500)    NOT NULL,                 -- Subject/NameID from the IdP
    external_email      CITEXT,
    external_username   VARCHAR(255),
    profile_data        JSONB           NOT NULL DEFAULT '{}',    -- Raw claims from IdP
    last_login_at       TIMESTAMPTZ,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_federated_identity UNIQUE (idp_id, external_user_id)
);

COMMENT ON TABLE federated_identities IS 'Links users to external IdP identities. Enables multi-IdP login for a single user.';

CREATE TRIGGER trg_federated_identities_updated_at
    BEFORE UPDATE ON federated_identities
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  SECTION 5: GROUPS & DIRECTORY                                             ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

-- ============================================================================
-- 5.1 GROUPS
-- ============================================================================
-- Groups are tenant-scoped. Used for ReBAC: group membership flows permissions.
-- Supports nested groups (a group can contain other groups via OpenFGA model).

CREATE TABLE groups (
    id                  VARCHAR(90)     PRIMARY KEY,              -- TypeID: grp_...
    tenant_id           VARCHAR(90)     NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name                VARCHAR(255)    NOT NULL,
    slug                VARCHAR(255)    NOT NULL,
    description         TEXT,
    is_managed          BOOLEAN         NOT NULL DEFAULT FALSE,   -- TRUE = synced from IdP/SCIM, don't edit manually
    source              VARCHAR(50)     DEFAULT 'manual',         -- 'manual', 'scim', 'saml', 'oidc'
    external_id         VARCHAR(500),                             -- SCIM externalId
    metadata            JSONB           NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,

    CONSTRAINT uq_groups_tenant_slug UNIQUE (tenant_id, slug),
    CONSTRAINT uq_groups_external_id UNIQUE (tenant_id, external_id)
);

COMMENT ON TABLE groups IS 'Tenant-scoped groups. Membership here mirrors OpenFGA tuples for ReBAC.';

CREATE TRIGGER trg_groups_updated_at
    BEFORE UPDATE ON groups
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


-- ============================================================================
-- 5.2 GROUP MEMBERSHIPS
-- ============================================================================

CREATE TABLE group_memberships (
    id                  VARCHAR(90)     PRIMARY KEY,              -- TypeID: gm_...
    group_id            VARCHAR(90)     NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id             VARCHAR(90)     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role                VARCHAR(20)     NOT NULL DEFAULT 'member', -- 'admin', 'member'
    source              VARCHAR(50)     DEFAULT 'manual',         -- 'manual', 'scim', 'saml_sync'
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_group_memberships UNIQUE (group_id, user_id)
);

COMMENT ON TABLE group_memberships IS 'User-Group join. Each row should have a corresponding OpenFGA tuple.';


-- ============================================================================
-- 5.3 GROUP NESTING (Group contains Group)
-- ============================================================================
-- Models hierarchical groups. OpenFGA handles the transitive permission resolution.

CREATE TABLE group_nesting (
    id                  VARCHAR(90)     PRIMARY KEY,              -- TypeID: gn_...
    parent_group_id     VARCHAR(90)     NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    child_group_id      VARCHAR(90)     NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_group_nesting UNIQUE (parent_group_id, child_group_id),
    CONSTRAINT ck_no_self_nesting CHECK (parent_group_id != child_group_id)
);

COMMENT ON TABLE group_nesting IS 'Hierarchical group containment. OpenFGA resolves transitive memberships.';


-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  SECTION 6: RESOURCE HIERARCHY (Google Drive-like)                         ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

-- ============================================================================
-- 6.1 FOLDERS
-- ============================================================================

CREATE TABLE folders (
    id                  VARCHAR(90)     PRIMARY KEY,              -- TypeID: fld_...
    tenant_id           VARCHAR(90)     NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    parent_id           VARCHAR(90)     REFERENCES folders(id) ON DELETE CASCADE,  -- NULL = root folder
    name                VARCHAR(255)    NOT NULL,
    path                TEXT            NOT NULL DEFAULT '/',     -- Materialized path: /root/engineering/frontend
    depth               SMALLINT        NOT NULL DEFAULT 0,
    owner_user_id       VARCHAR(90)     REFERENCES users(id) ON DELETE SET NULL,
    metadata            JSONB           NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,

    CONSTRAINT uq_folders_tenant_path UNIQUE (tenant_id, path),
    CONSTRAINT ck_folder_depth CHECK (depth >= 0 AND depth <= 20)  -- Prevent infinite nesting
);

COMMENT ON TABLE folders IS 'Hierarchical folder structure. Parent-child resolved via OpenFGA for permission inheritance.';

CREATE TRIGGER trg_folders_updated_at
    BEFORE UPDATE ON folders
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


-- ============================================================================
-- 6.2 DOCUMENTS
-- ============================================================================

CREATE TABLE documents (
    id                  VARCHAR(90)     PRIMARY KEY,              -- TypeID: doc_...
    tenant_id           VARCHAR(90)     NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    folder_id           VARCHAR(90)     REFERENCES folders(id) ON DELETE SET NULL,
    owner_user_id       VARCHAR(90)     NOT NULL REFERENCES users(id),
    title               VARCHAR(500)    NOT NULL,
    content_type        VARCHAR(100),                             -- MIME type
    size_bytes          BIGINT          DEFAULT 0,
    storage_key         TEXT,                                     -- S3/object storage path
    version             INTEGER         NOT NULL DEFAULT 1,
    metadata            JSONB           NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,

    CONSTRAINT ck_doc_size CHECK (size_bytes >= 0)
);

COMMENT ON TABLE documents IS 'Documents owned by users, placed in folders. Permissions flow via OpenFGA folder→document.';

CREATE TRIGGER trg_documents_updated_at
    BEFORE UPDATE ON documents
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


-- ============================================================================
-- 6.3 API RESOURCES
-- ============================================================================
-- Represents API endpoints/resources that can be protected with ReBAC.

CREATE TABLE api_resources (
    id                  VARCHAR(90)     PRIMARY KEY,              -- TypeID: ares_...
    tenant_id           VARCHAR(90)     NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    application_id      VARCHAR(90)     NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE,
    name                VARCHAR(255)    NOT NULL,
    identifier          VARCHAR(500)    NOT NULL,                 -- URI: https://api.acme.com/v1/orders
    description         TEXT,
    available_scopes    TEXT[]          NOT NULL DEFAULT '{}',
    is_active           BOOLEAN         NOT NULL DEFAULT TRUE,
    metadata            JSONB           NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_api_resources_identifier UNIQUE (tenant_id, identifier)
);

COMMENT ON TABLE api_resources IS 'API resources/endpoints that can be protected via ReBAC permission checks.';

CREATE TRIGGER trg_api_resources_updated_at
    BEFORE UPDATE ON api_resources
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


-- ============================================================================
-- 6.4 FEATURE FLAGS
-- ============================================================================

CREATE TABLE feature_flags (
    id                  VARCHAR(90)     PRIMARY KEY,              -- TypeID: ff_...
    tenant_id           VARCHAR(90)     NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    key                 VARCHAR(100)    NOT NULL,                 -- 'enable_new_dashboard', 'beta_api_v2'
    description         TEXT,
    is_enabled          BOOLEAN         NOT NULL DEFAULT FALSE,
    rollout_percentage  SMALLINT        DEFAULT 0,               -- 0-100
    allowed_user_ids    VARCHAR(90)[]   DEFAULT '{}',            -- Explicit user allowlist
    allowed_group_ids   VARCHAR(90)[]   DEFAULT '{}',            -- Explicit group allowlist
    metadata            JSONB           NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_feature_flags_key UNIQUE (tenant_id, key),
    CONSTRAINT ck_rollout_pct CHECK (rollout_percentage BETWEEN 0 AND 100)
);

COMMENT ON TABLE feature_flags IS 'Tenant-scoped feature flags. Can also use OpenFGA enabled_for relation.';

CREATE TRIGGER trg_feature_flags_updated_at
    BEFORE UPDATE ON feature_flags
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  SECTION 7: WEBHOOKS & EVENTS                                             ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

-- ============================================================================
-- 7.1 WEBHOOK ENDPOINTS
-- ============================================================================

CREATE TABLE webhook_endpoints (
    id                  VARCHAR(90)     PRIMARY KEY,              -- TypeID: whk_...
    tenant_id           VARCHAR(90)     NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    url                 TEXT            NOT NULL,
    description         VARCHAR(500),
    secret_hash         VARCHAR(255)    NOT NULL,                 -- HMAC signing secret (hashed for storage)
    secret_encrypted    TEXT            NOT NULL,                 -- Vault-encrypted signing secret (for delivery)
    subscribed_events   webhook_event_type[] NOT NULL,
    is_active           BOOLEAN         NOT NULL DEFAULT TRUE,
    failure_count       INTEGER         NOT NULL DEFAULT 0,       -- Consecutive failures
    disabled_at         TIMESTAMPTZ,                              -- Auto-disabled after N failures
    metadata            JSONB           NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT ck_webhook_url CHECK (url ~ '^https://')          -- HTTPS only
);

COMMENT ON TABLE webhook_endpoints IS 'Customer-configured webhook endpoints per tenant. HTTPS required.';

CREATE TRIGGER trg_webhook_endpoints_updated_at
    BEFORE UPDATE ON webhook_endpoints
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


-- ============================================================================
-- 7.2 WEBHOOK DELIVERIES (Delivery Attempts Log)
-- ============================================================================
-- Append-only log of every delivery attempt. Partitioned by month.

CREATE TABLE webhook_deliveries (
    id                  VARCHAR(90)     NOT NULL,                 -- TypeID: wdel_...
    endpoint_id         VARCHAR(90)     NOT NULL,                 -- FK checked at app level (partitioned tables)
    tenant_id           VARCHAR(90)     NOT NULL,
    event_type          webhook_event_type NOT NULL,
    payload             JSONB           NOT NULL,
    status              webhook_delivery_status NOT NULL DEFAULT 'pending',
    http_status_code    SMALLINT,
    response_body       TEXT,                                     -- Truncated response (first 1KB)
    attempt_number      SMALLINT        NOT NULL DEFAULT 1,
    max_attempts        SMALLINT        NOT NULL DEFAULT 5,
    next_retry_at       TIMESTAMPTZ,
    duration_ms         INTEGER,                                  -- Response time
    error_message       TEXT,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_webhook_deliveries PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

COMMENT ON TABLE webhook_deliveries IS 'Append-only webhook delivery log. Partitioned monthly for efficient cleanup.';

-- Monthly partitions (create via cron or pg_partman)
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


-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  SECTION 8: AUDIT LOGS (Immutable, Append-Only)                            ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

CREATE TABLE audit_logs (
    id                  BIGSERIAL       NOT NULL,                 -- Auto-increment (not TypeID — high volume)
    tenant_id           VARCHAR(90)     NOT NULL,
    actor_id            VARCHAR(90),                              -- Who performed the action
    actor_type          audit_actor_type NOT NULL DEFAULT 'user',
    actor_ip            INET,
    actor_user_agent    TEXT,
    action              VARCHAR(100)    NOT NULL,                 -- 'user.login', 'permission.check', 'tuple.write'
    resource_type       VARCHAR(100),                             -- 'user', 'group', 'application', 'document'
    resource_id         VARCHAR(255),
    description         TEXT,                                     -- Human-readable action description
    metadata            JSONB           NOT NULL DEFAULT '{}',    -- Context: old/new values, request details
    request_id          VARCHAR(64),                              -- Correlation ID for tracing
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_audit_logs PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

COMMENT ON TABLE audit_logs IS 'Immutable, append-only audit trail. Partitioned monthly. Archived to S3 after 90 days.';

-- Prevent any UPDATE or DELETE on audit_logs
CREATE TRIGGER trg_audit_logs_immutable
    BEFORE UPDATE OR DELETE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION trigger_prevent_mutation();

-- Monthly partitions
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


-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  SECTION 9: DEVELOPER PORTAL                                              ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

-- ============================================================================
-- 9.1 API KEYS
-- ============================================================================

CREATE TABLE api_keys (
    id                  VARCHAR(90)     PRIMARY KEY,              -- TypeID: akey_...
    tenant_id           VARCHAR(90)     NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id             VARCHAR(90)     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name                VARCHAR(255)    NOT NULL,
    key_prefix          VARCHAR(12)     NOT NULL,                 -- 'sk_live_abc1' — for identification
    key_hash            VARCHAR(255)    NOT NULL,                 -- SHA-256 hash of the full key
    status              api_key_status  NOT NULL DEFAULT 'active',
    scopes              TEXT[]          NOT NULL DEFAULT '{}',    -- Allowed API scopes
    allowed_ips         CIDR[]          DEFAULT '{}',             -- IP restriction
    rate_limit_per_min  INTEGER         DEFAULT 1000,
    last_used_at        TIMESTAMPTZ,
    expires_at          TIMESTAMPTZ,
    revoked_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_api_keys_prefix UNIQUE (key_prefix),
    CONSTRAINT ck_rate_limit CHECK (rate_limit_per_min > 0)
);

COMMENT ON TABLE api_keys IS 'Developer API keys. The full key is shown once at creation, only the hash is stored.';


-- ============================================================================
-- 9.2 API KEY USAGE (Daily Aggregated)
-- ============================================================================

CREATE TABLE api_key_usage (
    id                  BIGSERIAL       PRIMARY KEY,
    api_key_id          VARCHAR(90)     NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    tenant_id           VARCHAR(90)     NOT NULL,
    date                DATE            NOT NULL,
    request_count       BIGINT          NOT NULL DEFAULT 0,
    error_count         BIGINT          NOT NULL DEFAULT 0,
    avg_latency_ms      NUMERIC(10,2)   DEFAULT 0,
    p99_latency_ms      NUMERIC(10,2)   DEFAULT 0,
    bandwidth_bytes     BIGINT          DEFAULT 0,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_api_key_usage_daily UNIQUE (api_key_id, date)
);

COMMENT ON TABLE api_key_usage IS 'Daily aggregated API usage per key. Used for billing, quotas, and developer analytics.';


-- ============================================================================
-- 9.3 SCIM TOKENS (Enterprise Provisioning)
-- ============================================================================

CREATE TABLE scim_tokens (
    id                  VARCHAR(90)     PRIMARY KEY,              -- TypeID: scim_...
    tenant_id           VARCHAR(90)     NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    token_hash          VARCHAR(255)    NOT NULL,                 -- SHA-256 of bearer token
    token_prefix        VARCHAR(12)     NOT NULL,                 -- For identification
    label               VARCHAR(255),
    is_active           BOOLEAN         NOT NULL DEFAULT TRUE,
    last_used_at        TIMESTAMPTZ,
    expires_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_scim_tokens_hash UNIQUE (token_hash)
);

COMMENT ON TABLE scim_tokens IS 'Bearer tokens for SCIM 2.0 provisioning. Issued per tenant for IdP integration.';


-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  SECTION 10: SCIM PROVISIONING SYNC STATE                                 ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

CREATE TABLE scim_sync_log (
    id                  BIGSERIAL       PRIMARY KEY,
    tenant_id           VARCHAR(90)     NOT NULL,
    idp_id              VARCHAR(90),
    operation           VARCHAR(20)     NOT NULL,                 -- 'create', 'update', 'delete', 'patch'
    resource_type       VARCHAR(20)     NOT NULL,                 -- 'User', 'Group'
    external_id         VARCHAR(500),
    internal_id         VARCHAR(90),                              -- TypeID of the created/updated resource
    status              VARCHAR(20)     NOT NULL,                 -- 'success', 'error', 'skipped'
    error_message       TEXT,
    request_payload     JSONB,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE scim_sync_log IS 'SCIM provisioning audit trail. Tracks every create/update/delete from IdP.';


-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  SECTION 11: INDEXES (Optimized for Query Patterns)                        ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

-- ── Tenants ──
CREATE INDEX idx_tenants_slug ON tenants (slug) WHERE deleted_at IS NULL;
CREATE INDEX idx_tenants_domain ON tenants (domain) WHERE domain IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_tenants_plan ON tenants (plan) WHERE is_active = TRUE;

-- ── Users ──
CREATE INDEX idx_users_email ON users (email) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_status ON users (status) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_last_login ON users (last_login_at DESC NULLS LAST) WHERE status = 'active';
-- Trigram index for fuzzy search (user search bar in admin console)
CREATE INDEX idx_users_display_name_trgm ON users USING GIN (display_name gin_trgm_ops) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_email_trgm ON users USING GIN ((email::TEXT) gin_trgm_ops) WHERE deleted_at IS NULL;

-- ── Password History ──
CREATE INDEX idx_password_history_user ON password_history (user_id, created_at DESC);

-- ── Memberships ──
CREATE INDEX idx_memberships_user ON memberships (user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_memberships_tenant ON memberships (tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_memberships_tenant_role ON memberships (tenant_id, role) WHERE deleted_at IS NULL;

-- ── MFA ──
CREATE INDEX idx_mfa_enrollments_user ON mfa_enrollments (user_id, status);
CREATE INDEX idx_mfa_backup_codes_user ON mfa_backup_codes (user_id) WHERE used_at IS NULL;

-- ── Sessions ──
CREATE INDEX idx_sessions_user ON sessions (user_id, status) WHERE status = 'active';
CREATE INDEX idx_sessions_tenant ON sessions (tenant_id, status) WHERE status = 'active';
CREATE INDEX idx_sessions_token_hash ON sessions (token_hash);
CREATE INDEX idx_sessions_expires ON sessions (expires_at) WHERE status = 'active';

-- ── OAuth Clients ──
CREATE INDEX idx_oauth_clients_tenant ON oauth_clients (tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_oauth_clients_client_id ON oauth_clients (client_id) WHERE is_active = TRUE;

-- ── Client Secrets ──
CREATE INDEX idx_client_secrets_client ON oauth_client_secrets (client_id) WHERE is_active = TRUE;

-- ── User Consents ──
CREATE INDEX idx_user_consents_user ON user_consents (user_id, status);

-- ── Token Deny List ──
CREATE INDEX idx_token_deny_list_expires ON token_deny_list (expires_at);
-- Cleanup job: DELETE FROM token_deny_list WHERE expires_at < NOW();

-- ── Refresh Token Families ──
CREATE INDEX idx_rtf_user ON refresh_token_families (user_id) WHERE is_revoked = FALSE;
CREATE INDEX idx_rtf_expires ON refresh_token_families (expires_at) WHERE is_revoked = FALSE;

-- ── Identity Providers ──
CREATE INDEX idx_idp_tenant ON identity_providers (tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_idp_domain_hint ON identity_providers (domain_hint) WHERE status = 'active' AND deleted_at IS NULL;

-- ── Federated Identities ──
CREATE INDEX idx_federated_user ON federated_identities (user_id);
CREATE INDEX idx_federated_idp_external ON federated_identities (idp_id, external_user_id);

-- ── Groups ──
CREATE INDEX idx_groups_tenant ON groups (tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_groups_external_id ON groups (tenant_id, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX idx_groups_name_trgm ON groups USING GIN (name gin_trgm_ops) WHERE deleted_at IS NULL;

-- ── Group Memberships ──
CREATE INDEX idx_group_memberships_group ON group_memberships (group_id);
CREATE INDEX idx_group_memberships_user ON group_memberships (user_id);

-- ── Group Nesting ──
CREATE INDEX idx_group_nesting_parent ON group_nesting (parent_group_id);
CREATE INDEX idx_group_nesting_child ON group_nesting (child_group_id);

-- ── Folders ──
CREATE INDEX idx_folders_tenant ON folders (tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_folders_parent ON folders (parent_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_folders_path ON folders (tenant_id, path) WHERE deleted_at IS NULL;

-- ── Documents ──
CREATE INDEX idx_documents_tenant ON documents (tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_documents_folder ON documents (folder_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_documents_owner ON documents (owner_user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_documents_title_trgm ON documents USING GIN (title gin_trgm_ops) WHERE deleted_at IS NULL;

-- ── API Resources ──
CREATE INDEX idx_api_resources_tenant ON api_resources (tenant_id);
CREATE INDEX idx_api_resources_app ON api_resources (application_id);

-- ── Feature Flags ──
CREATE INDEX idx_feature_flags_tenant ON feature_flags (tenant_id);

-- ── Webhook Endpoints ──
CREATE INDEX idx_webhook_endpoints_tenant ON webhook_endpoints (tenant_id) WHERE is_active = TRUE;

-- ── Webhook Deliveries (on each partition) ──
CREATE INDEX idx_webhook_deliveries_endpoint ON webhook_deliveries (endpoint_id, created_at DESC);
CREATE INDEX idx_webhook_deliveries_tenant ON webhook_deliveries (tenant_id, created_at DESC);
CREATE INDEX idx_webhook_deliveries_status ON webhook_deliveries (status) WHERE status IN ('pending', 'retrying');

-- ── Audit Logs (on each partition) ──
CREATE INDEX idx_audit_logs_tenant_action ON audit_logs (tenant_id, action, created_at DESC);
CREATE INDEX idx_audit_logs_actor ON audit_logs (actor_id, created_at DESC) WHERE actor_id IS NOT NULL;
CREATE INDEX idx_audit_logs_resource ON audit_logs (resource_type, resource_id, created_at DESC);
CREATE INDEX idx_audit_logs_request_id ON audit_logs (request_id) WHERE request_id IS NOT NULL;

-- ── API Keys ──
CREATE INDEX idx_api_keys_tenant ON api_keys (tenant_id) WHERE status = 'active';
CREATE INDEX idx_api_keys_hash ON api_keys (key_hash);
CREATE INDEX idx_api_keys_prefix ON api_keys (key_prefix) WHERE status = 'active';

-- ── API Key Usage ──
CREATE INDEX idx_api_key_usage_key_date ON api_key_usage (api_key_id, date DESC);
CREATE INDEX idx_api_key_usage_tenant_date ON api_key_usage (tenant_id, date DESC);

-- ── SCIM ──
CREATE INDEX idx_scim_tokens_tenant ON scim_tokens (tenant_id) WHERE is_active = TRUE;
CREATE INDEX idx_scim_sync_log_tenant ON scim_sync_log (tenant_id, created_at DESC);


-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  SECTION 12: ROW-LEVEL SECURITY (Multi-Tenant Isolation)                   ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

-- Every tenant-scoped query must SET app.current_tenant_id = 'ten_...' before querying.
-- RLS ensures data isolation even if application code has bugs.

ALTER TABLE memberships           ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_clients         ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_client_secrets  ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_consents         ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity_providers    ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups                ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_memberships     ENABLE ROW LEVEL SECURITY;
ALTER TABLE folders               ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents             ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_resources         ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_flags         ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_endpoints     ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys              ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions              ENABLE ROW LEVEL SECURITY;

-- RLS policies for direct tenant_id columns
CREATE POLICY rls_memberships ON memberships
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::VARCHAR);

CREATE POLICY rls_oauth_clients ON oauth_clients
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::VARCHAR);

CREATE POLICY rls_oauth_client_secrets ON oauth_client_secrets
    USING (client_id IN (SELECT id FROM oauth_clients WHERE tenant_id = current_setting('app.current_tenant_id', TRUE)::VARCHAR));

CREATE POLICY rls_user_consents ON user_consents
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::VARCHAR);

CREATE POLICY rls_identity_providers ON identity_providers
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::VARCHAR);

CREATE POLICY rls_groups ON groups
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::VARCHAR);

CREATE POLICY rls_group_memberships ON group_memberships
    USING (group_id IN (SELECT id FROM groups WHERE tenant_id = current_setting('app.current_tenant_id', TRUE)::VARCHAR));

CREATE POLICY rls_folders ON folders
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::VARCHAR);

CREATE POLICY rls_documents ON documents
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::VARCHAR);

CREATE POLICY rls_api_resources ON api_resources
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::VARCHAR);

CREATE POLICY rls_feature_flags ON feature_flags
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::VARCHAR);

CREATE POLICY rls_webhook_endpoints ON webhook_endpoints
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::VARCHAR);

CREATE POLICY rls_api_keys ON api_keys
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::VARCHAR);

CREATE POLICY rls_sessions ON sessions
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::VARCHAR);


-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  SECTION 13: MAINTENANCE JOBS (Scheduled via pg_cron or app-level)         ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

-- These queries should be scheduled via pg_cron, Kubernetes CronJob, or BullMQ:

-- 1. Clean up expired token deny-list entries (run every 15 min)
--    DELETE FROM token_deny_list WHERE expires_at < NOW();

-- 2. Clean up expired refresh token families (run every hour)
--    DELETE FROM refresh_token_families WHERE expires_at < NOW();

-- 3. Expire old sessions (run every hour)
--    UPDATE sessions SET status = 'expired' WHERE status = 'active' AND expires_at < NOW();

-- 4. Archive old audit log partitions to S3 (monthly)
--    DETACH old partition → pg_dump → upload to S3 → DROP partition

-- 5. Create next month's partitions (run on 25th of each month)
--    For audit_logs, webhook_deliveries

-- 6. Purge soft-deleted records older than retention period (run weekly)
--    DELETE FROM users WHERE deleted_at < NOW() - INTERVAL '90 days';
--    DELETE FROM tenants WHERE deleted_at < NOW() - INTERVAL '90 days';

-- 7. Vacuum analyze high-write tables (run daily)
--    VACUUM ANALYZE sessions;
--    VACUUM ANALYZE audit_logs;
--    VACUUM ANALYZE token_deny_list;


-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  SECTION 14: PERFORMANCE NOTES                                             ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

-- ┌─────────────────────────────────────────────────────────────────────────────┐
-- │ WHY TypeID (UUIDv7) FOR ALL PKs:                                           │
-- │                                                                             │
-- │ UUIDv7 is time-ordered (monotonically increasing). This means:             │
-- │ • B-tree inserts always land at the RIGHT edge — no random page splits     │
-- │ • Index fragmentation stays near 0% (vs ~50% with UUIDv4)                 │
-- │ • INSERT throughput: ~2x faster than UUIDv4 at 10M+ rows                  │
-- │ • Range scans on id (ORDER BY id, WHERE id > cursor) are efficient        │
-- │ • Natural time ordering = free "created_at" sort without extra index       │
-- │ • Type prefix (user_, ten_, app_) prevents cross-entity ID confusion       │
-- │                                                                             │
-- │ STORAGE: VARCHAR(90) ≈ 91 bytes vs UUID's 16 bytes.                       │
-- │ Trade-off: ~5x more storage per PK, but:                                  │
-- │ • Debuggability: user_01h2xcej... vs 550e8400-e29b-41d4-a716-...          │
-- │ • Type safety: TypeID<'user'> ≠ TypeID<'ten'> at compile time             │
-- │ • OpenFGA tuples become self-documenting:                                  │
-- │   user:user_01h2xcej... → member → organization:ten_01h2xcej...           │
-- │ For cost-sensitive tables (audit_logs), BIGSERIAL is used instead.         │
-- └─────────────────────────────────────────────────────────────────────────────┘

-- ┌─────────────────────────────────────────────────────────────────────────────┐
-- │ PARTIAL INDEXES:                                                            │
-- │                                                                             │
-- │ Most indexes use WHERE clauses (partial indexes) because:                  │
-- │ • deleted_at IS NULL: Soft-deleted rows are rarely queried                 │
-- │ • status = 'active': Most queries filter for active records                │
-- │ • Index size drops 10-50%, improving cache hit rates                       │
-- │ • Writes to inactive rows don't bloat the active index                    │
-- └─────────────────────────────────────────────────────────────────────────────┘

-- ┌─────────────────────────────────────────────────────────────────────────────┐
-- │ PARTITIONING STRATEGY:                                                      │
-- │                                                                             │
-- │ • audit_logs: RANGE by created_at (monthly)                                │
-- │   - Query pattern: always filtered by tenant_id + time range               │
-- │   - Old partitions archived to S3, then detached/dropped                   │
-- │   - Keeps active partition small = fast inserts + queries                  │
-- │                                                                             │
-- │ • webhook_deliveries: RANGE by created_at (monthly)                        │
-- │   - Same rationale: high-volume, time-series, archivable                   │
-- │                                                                             │
-- │ For 10M+ users: consider HASH partitioning on tenant_id for:              │
-- │   - memberships, sessions, group_memberships                               │
-- │   - Use pg_partman for automatic partition management                      │
-- └─────────────────────────────────────────────────────────────────────────────┘

-- ┌─────────────────────────────────────────────────────────────────────────────┐
-- │ CONNECTION POOLING (Required):                                              │
-- │                                                                             │
-- │ • PgBouncer in transaction mode (pgbouncer.ini):                           │
-- │   pool_mode = transaction                                                   │
-- │   max_client_conn = 10000                                                   │
-- │   default_pool_size = 50                                                    │
-- │   reserve_pool_size = 10                                                    │
-- │                                                                             │
-- │ • RLS with PgBouncer: Use SET LOCAL (transaction-scoped) instead of SET:   │
-- │   BEGIN;                                                                    │
-- │   SET LOCAL app.current_tenant_id = 'ten_01h2xcej...';                    │
-- │   SELECT * FROM memberships; -- RLS filters automatically                  │
-- │   COMMIT;                                                                   │
-- └─────────────────────────────────────────────────────────────────────────────┘

-- ┌─────────────────────────────────────────────────────────────────────────────┐
-- │ SCALING ROADMAP:                                                            │
-- │                                                                             │
-- │ Stage 1 (< 100K users): Single Postgres, read replicas for analytics      │
-- │ Stage 2 (100K-1M users): Partitioning + PgBouncer + read replicas         │
-- │ Stage 3 (1M+ users): Citus extension for distributed Postgres             │
-- │   OR: Dedicated database per large enterprise tenant                        │
-- │ Stage 4 (10M+ users): Vitess or custom sharding by tenant_id              │
-- └─────────────────────────────────────────────────────────────────────────────┘


-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  END OF SCHEMA                                                             ║
-- ║                                                                            ║
-- ║  Table Count: 25 tables                                                    ║
-- ║  Partitioned: audit_logs, webhook_deliveries (monthly)                     ║
-- ║  RLS Enabled: 15 tenant-scoped tables                                      ║
-- ║  Enum Types: 16 domain-specific enums                                      ║
-- ║  Indexes: 55+ (partial, trigram, composite)                                ║
-- ║  Triggers: auto-updated_at, immutable audit_logs                           ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝
