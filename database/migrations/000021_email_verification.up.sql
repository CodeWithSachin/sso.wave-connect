-- Migration 000021: Consumer signup support
--
-- Phase 1 of the dual-product onboarding plan. Adds:
--   1. `tenant_kind` enum + column on `tenants` — distinguishes auto-created
--      personal tenants (one per consumer signup) from real orgs.
--   2. `email_verification_tokens` table — holds the SHA-256 hash of the raw
--      verification token sent in the email. Raw token never persists.
--
-- Ownership-invariant "one personal tenant per user as owner" is NOT enforced
-- by a unique index (PostgreSQL partial indexes can't reference another table's
-- column in the predicate). Enforced in application code inside the signup
-- service — see `internal/service/signup_service.go`. The race window is tiny
-- and the worst case (two personal tenants for one user) is cleanable.

-- ── 1. tenant_kind ──────────────────────────────────────────────────────────
CREATE TYPE tenant_kind AS ENUM ('personal', 'organization');

-- Existing tenants are all orgs (pre-phase-1 there was no consumer flow).
-- NOT NULL + DEFAULT means the ALTER is instant on new Postgres versions
-- and safe to run on a non-empty tenants table.
ALTER TABLE tenants
    ADD COLUMN tenant_kind tenant_kind NOT NULL DEFAULT 'organization';

-- Hot path: "list all personal tenants for this user" during login account-switcher
-- (Phase 5) and "find orphan personal tenants" for the migration worker (Phase 4).
CREATE INDEX idx_tenants_personal ON tenants (tenant_kind) WHERE tenant_kind = 'personal' AND deleted_at IS NULL;

COMMENT ON COLUMN tenants.tenant_kind IS
    'Distinguishes personal (auto-created by consumer signup) from organization (provisioned explicitly). See migration 000021.';

-- ── 2. email_verification_tokens ────────────────────────────────────────────
CREATE TABLE email_verification_tokens (
    token_hash   VARCHAR(64)    PRIMARY KEY,             -- SHA-256 hex of raw token
    user_id      UUID           NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email        CITEXT         NOT NULL,                -- denormalized for audit / email-change flows
    expires_at   TIMESTAMPTZ    NOT NULL,
    consumed_at  TIMESTAMPTZ,
    created_at   TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- Hot path: "find active verification for user" during resend
-- (avoids sending duplicate emails / enables invalidate-on-new-issue).
CREATE INDEX idx_email_verification_tokens_active
    ON email_verification_tokens (user_id)
    WHERE consumed_at IS NULL;

COMMENT ON TABLE email_verification_tokens IS
    'One-time-use tokens for post-signup email verification. Raw token is emailed; only SHA-256 hex stored here. See Phase 1 signup flow.';
