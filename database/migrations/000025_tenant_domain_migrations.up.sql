-- Migration 000025: Tenant Domain Migrations (Phase 4 — post-claim user moves)
--
-- When a tenant_domains row flips to `verified`, the migration worker looks
-- for users whose email matches the claimed domain AND who currently belong
-- to a personal tenant (tenant_kind='personal', max_users=1). For each such
-- user it inserts a row here with status='offered' and emails the user an
-- accept/decline link with a 30-day grace window.
--
-- Acceptance moves the user's owner membership from the personal tenant to
-- the org tenant (as role=member), soft-deletes the personal tenant, and
-- revokes active sessions so the user re-logs into the org context.
--
-- Decline leaves state untouched — the user keeps their personal workspace.
-- Once `expires_at` passes, an org owner can force-migrate (a second email
-- goes out 7 days before the forced move).
--
-- The notification_token is a random 32-byte value (base64url, 43 chars); it
-- is stored in cleartext here because it must be in the email link. Tokens
-- are single-use (consumed on accept/decline/force) and scoped to this row.

-- ── 1. migration-status enum ────────────────────────────────────────────────
CREATE TYPE migration_status AS ENUM (
    'offered',      -- row created, waiting on user decision
    'accepted',     -- user clicked "join organization"; membership moved
    'declined',     -- user clicked "keep personal workspace"
    'force_moved',  -- org owner forced the move post-expiry
    'expired'       -- grace period elapsed without decision; admin may force
);

-- ── 2. tenant_domain_migrations ─────────────────────────────────────────────
CREATE TABLE tenant_domain_migrations (
    id                 UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID              NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    from_tenant_id     UUID              NOT NULL REFERENCES tenants(id),     -- personal tenant being vacated
    to_tenant_id       UUID              NOT NULL REFERENCES tenants(id),     -- org tenant being joined
    domain             CITEXT            NOT NULL,                            -- denormalized for audit + worker filter
    status             migration_status  NOT NULL DEFAULT 'offered',
    offered_at         TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
    responded_at       TIMESTAMPTZ,                                           -- set on accept/decline/force
    expires_at         TIMESTAMPTZ       NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
    notification_token VARCHAR(64)       NOT NULL,
    force_notified_at  TIMESTAMPTZ,                                           -- set when 7-day heads-up email sent
    created_at         TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ       NOT NULL DEFAULT NOW(),

    -- One active offer per (user, org). Re-offering after a decline requires
    -- admin force-migrate, not a second auto-insert.
    CONSTRAINT uq_migration_user_org UNIQUE (user_id, to_tenant_id)
);

-- Token lookup is the hot path for /auth/public/migration/:token/*.
CREATE UNIQUE INDEX uq_tenant_domain_migrations_token
    ON tenant_domain_migrations (notification_token);

-- Dashboard + force-migrate queries: "show me pending migrations for this org".
CREATE INDEX idx_tenant_domain_migrations_org
    ON tenant_domain_migrations (to_tenant_id, status, expires_at);

-- Expiry sweeper (future cron): "what's past grace and still offered?".
CREATE INDEX idx_tenant_domain_migrations_expiring
    ON tenant_domain_migrations (expires_at)
    WHERE status = 'offered';

-- Auto-update updated_at on any UPDATE.
CREATE TRIGGER trg_tenant_domain_migrations_updated_at
    BEFORE UPDATE ON tenant_domain_migrations
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

COMMENT ON TABLE tenant_domain_migrations IS
    'One row per user-to-org migration offer created when a tenant_domains row verifies. Tracks the 30-day grace window and the user decision.';
COMMENT ON COLUMN tenant_domain_migrations.from_tenant_id IS
    'The personal tenant the user is being moved out of. Soft-deleted on accept/force_moved.';
COMMENT ON COLUMN tenant_domain_migrations.notification_token IS
    'Single-use 32-byte random (base64url) included in the offer email link. Consumed on accept/decline/force.';
COMMENT ON COLUMN tenant_domain_migrations.force_notified_at IS
    'Populated when the 7-day heads-up email goes out. NULL means the org owner has not yet initiated force-migrate.';
