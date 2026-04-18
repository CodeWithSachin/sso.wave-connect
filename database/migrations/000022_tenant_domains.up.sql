-- Migration 000022: Tenant Domains (DNS-verified ownership)
--
-- Phase 2 of the dual-product onboarding plan. Introduces DNS-TXT-based domain
-- claim so an org can prove it owns `acme.com` and thereby gate email-first
-- login routing (Phase 3), post-claim consumer migration (Phase 4), and SSO
-- federation (existing identity_providers table).
--
-- One table does the work:
--
--   - `tenant_domains` — one row per active OR pending claim. Status flips from
--     'pending' → 'verified' when a TXT record containing the stored
--     verification_token is observed on `_wave-connect-verify.<domain>`. A
--     partial unique index guarantees at most one VERIFIED tenant per domain
--     globally; multiple pending claims on the same domain are allowed (only
--     one wins the verify race).
--
-- The `tenants.domain` column added in migration 000003 is demoted to
-- display-only; code paths that need authority on a domain claim MUST join
-- against `tenant_domains WHERE status='verified' AND deleted_at IS NULL`.

-- ── 1. verification method enum ─────────────────────────────────────────────
CREATE TYPE verification_method AS ENUM ('dns_txt', 'dns_mx', 'html_meta');

-- Phase 2 ships `dns_txt` only. `dns_mx` and `html_meta` exist in the enum so
-- adding them later is an ALTER TYPE rather than a schema change.
COMMENT ON TYPE verification_method IS
    'Transport used to prove domain ownership. Only dns_txt is wired today.';

-- ── 2. claim-status enum ────────────────────────────────────────────────────
-- Dedicated type (not a CHECK constraint) so Postgres surfaces invalid values
-- with a type error rather than a CHECK violation, and so ALTER TYPE can grow
-- it cleanly.
CREATE TYPE tenant_domain_status AS ENUM ('pending', 'verified', 'failed', 'expired');

-- ── 3. tenant_domains ───────────────────────────────────────────────────────
CREATE TABLE tenant_domains (
    id                   UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            UUID                  NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    domain               CITEXT                NOT NULL,
    verification_method  verification_method   NOT NULL DEFAULT 'dns_txt',
    verification_token   VARCHAR(64)           NOT NULL,                       -- 32-byte random, base64url-encoded
    status               tenant_domain_status  NOT NULL DEFAULT 'pending',
    is_primary           BOOLEAN               NOT NULL DEFAULT FALSE,         -- which verified domain is the tenant's "main"
    verified_at          TIMESTAMPTZ,
    last_checked_at      TIMESTAMPTZ,
    check_attempts       INTEGER               NOT NULL DEFAULT 0,
    expires_at           TIMESTAMPTZ           NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
    created_by           UUID                  REFERENCES users(id) ON DELETE SET NULL,
    created_at           TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
    deleted_at           TIMESTAMPTZ
);

-- Exactly one verified claim per domain, globally. Two tenants can both have
-- a pending claim on `acme.com`; the first to verify wins and locks the others
-- out of verification (the cron UPDATE will fail the partial-unique check).
CREATE UNIQUE INDEX uq_tenant_domains_verified_domain
    ON tenant_domains (domain)
    WHERE status = 'verified' AND deleted_at IS NULL;

-- Hot path for the verification cron: claim the next N pending rows to check.
CREATE INDEX idx_tenant_domains_pending
    ON tenant_domains (last_checked_at NULLS FIRST)
    WHERE status = 'pending' AND deleted_at IS NULL;

-- Hot path for the tenant-admin UI: list my org's claims.
CREATE INDEX idx_tenant_domains_tenant
    ON tenant_domains (tenant_id)
    WHERE deleted_at IS NULL;

-- Hot path for /auth/public/discover (Phase 3): find the verified tenant for
-- a domain. Covered by uq_tenant_domains_verified_domain above, but having a
-- non-unique lookup index on (domain) simplifies planner choices.
CREATE INDEX idx_tenant_domains_domain_lookup
    ON tenant_domains (domain)
    WHERE deleted_at IS NULL;

-- Auto-update updated_at on any UPDATE.
CREATE TRIGGER trg_tenant_domains_updated_at
    BEFORE UPDATE ON tenant_domains
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

COMMENT ON TABLE tenant_domains IS
    'Source of truth for domain claims. tenants.domain is now display-only.';
COMMENT ON COLUMN tenant_domains.verification_token IS
    '32-byte random nonce, base64url-encoded. Published as TXT on _wave-connect-verify.<domain>. Never rotated while the claim is alive.';
COMMENT ON COLUMN tenant_domains.is_primary IS
    'Exactly one VERIFIED tenant_domains row per tenant should have is_primary=TRUE. Enforced in application code, not a constraint.';
