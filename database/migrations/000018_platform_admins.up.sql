-- Migration 000018: Platform Admins
--
-- [FIX-18] Adds a cross-tenant role namespace for platform staff (e.g. the
-- humans running sso.wave-connect itself), distinct from `memberships` which
-- is RLS-tenant-scoped and would otherwise hide platform-admin grants from
-- any query that isn't executed with a specific tenant context.
--
-- A user is a platform admin IFF a row exists here AND `revoked_at IS NULL`.
-- Consumed by `PlatformAdminGuard` in `libs/nestjs-auth` to gate endpoints
-- like `POST /api/v1/tenants` (which today has no role check — see the guard
-- wiring in `apps/admin-api/src/tenants/tenants.controller.ts`).

CREATE TYPE platform_admin_role AS ENUM ('superadmin', 'support', 'readonly');

CREATE TABLE platform_admins (
    user_id     UUID                   PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    role        platform_admin_role    NOT NULL,
    granted_by  UUID                   REFERENCES users(id) ON DELETE SET NULL,
    granted_at  TIMESTAMPTZ            NOT NULL DEFAULT NOW(),
    revoked_at  TIMESTAMPTZ,
    notes       TEXT
);

-- Hot path: "is this user a platform admin right now?" — called on every
-- protected admin-api request. Partial index keeps it tight.
CREATE INDEX idx_platform_admins_active
    ON platform_admins (user_id)
    WHERE revoked_at IS NULL;

COMMENT ON TABLE platform_admins IS
    'Cross-tenant role grants for platform staff. NOT RLS-tenant-scoped. Presence + revoked_at IS NULL = active.';
