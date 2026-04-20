import type {
  Capability,
  MembershipRole,
  PlatformAdminRole,
  TenantKind,
} from '@sso-platform/shared-types';

/**
 * Pure function that maps (platform role, active-tenant membership, tenant kind)
 * into the capability set the admin-console shell consumes.
 *
 * Single source of truth for permission UX. Frontend only reads
 * `capabilities.includes(c)` — it never re-derives. Backend enforcement is
 * independent (guards, OpenFGA, Prisma RLS); this function exists only to tell
 * the client what to render.
 *
 * Kept as a pure function (no I/O, no NestJS decorators) so unit tests can
 * drive every row of the matrix deterministically.
 *
 * Matrix mirrors docs/plans/admin-role-surfaces.md (plan v2). Any change here
 * must be reflected in the plan + the frontend capability table tests.
 */
export function computeCapabilities(input: {
  platformRole: PlatformAdminRole | null;
  activeMembershipRole: MembershipRole | null;
  activeTenantKind: TenantKind | null;
}): Capability[] {
  const caps = new Set<Capability>();

  // --- Platform tier (cross-tenant) ---
  if (input.platformRole === 'superadmin') {
    caps.add('view_platform_admins');
    caps.add('manage_platform_admins');
    caps.add('view_tenant_settings');
    caps.add('view_audit_log');
  } else if (input.platformRole === 'support') {
    caps.add('view_platform_admins');
    caps.add('view_tenant_settings');
    caps.add('view_audit_log');
  } else if (input.platformRole === 'readonly') {
    caps.add('view_audit_log');
  }

  // --- Per-tenant tier (scoped to the active tenant) ---
  const role = input.activeMembershipRole;
  const kind = input.activeTenantKind;

  if (kind === 'organization') {
    if (role === 'owner' || role === 'admin') {
      caps.add('view_tenant_settings');
      caps.add('manage_members');
      caps.add('manage_domains');
      caps.add('manage_identity_providers');
      caps.add('manage_invitations');
      caps.add('view_migrations');
      caps.add('view_audit_log');
    }
    if (role === 'owner') {
      caps.add('force_migration');
    }
    if (role === 'readonly') {
      caps.add('view_audit_log');
    }
  }

  if (kind === 'personal' && role === 'owner') {
    // Individual-tier users see only a simplified settings surface on their
    // personal tenant. Plan decision: redirect admin-only pages to /dashboard.
    caps.add('view_tenant_settings');
  }

  return Array.from(caps).sort();
}
