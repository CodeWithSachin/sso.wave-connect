-- Migration 000027: sessions.active_tenant_id — multi-tenant session switcher.
--
-- Phase 5 of the dual-product onboarding plan. Users in >1 tenant (e.g. a
-- consumer who kept their personal workspace and joined an org via invite)
-- need to flip the active tenant without re-authenticating. Today the only
-- column that names a session's tenant is `sessions.tenant_id`, which is the
-- tenant they logged INTO; making it mutable would corrupt audit trails.
--
-- Introduce `active_tenant_id` as the LIVE tenant context:
--   - `tenant_id`           — anchor; the tenant the session was minted for.
--                             Never changes after creation. Used for audit /
--                             "where did this session originate?" queries.
--   - `active_tenant_id`    — current tenant the session is acting on behalf
--                             of. PATCH /auth/session/active-tenant flips it.
--                             At creation equals `tenant_id`.
--
-- Both columns are FK-constrained, and the backfill step populates existing
-- rows (active_tenant_id = tenant_id) before flipping to NOT NULL so the
-- invariant "every session has an active tenant" holds.

-- ── 1. add nullable column ──────────────────────────────────────────────────
ALTER TABLE sessions
    ADD COLUMN active_tenant_id UUID REFERENCES tenants(id);

-- ── 2. backfill to match the anchor ─────────────────────────────────────────
-- Every pre-existing session starts at the same tenant it was minted into.
UPDATE sessions SET active_tenant_id = tenant_id
    WHERE active_tenant_id IS NULL;

-- ── 3. tighten invariant ────────────────────────────────────────────────────
ALTER TABLE sessions
    ALTER COLUMN active_tenant_id SET NOT NULL;

-- ── 4. index for the "my active sessions for tenant X" admin query ─────────
-- Phase 5 itself doesn't need this, but Phase 2 session-management UI + the
-- RevokeAllByUserTx used by Phase 4 migration accept both filter on the
-- active tenant — not the anchor — once the switch lands.
CREATE INDEX idx_sessions_active_tenant
    ON sessions (active_tenant_id, status)
    WHERE status = 'active';

COMMENT ON COLUMN sessions.active_tenant_id IS
    'Live tenant context for this session. Starts equal to tenant_id; flipped by PATCH /auth/session/active-tenant. Session cookie + token_hash stay stable across switches.';
COMMENT ON COLUMN sessions.tenant_id IS
    'Anchor tenant: the tenant this session was minted for. Never mutated — used for audit trails and to validate the original login context.';
