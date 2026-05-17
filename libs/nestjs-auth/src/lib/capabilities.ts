import type {
  Capability,
  MembershipRole,
  PlatformAdminRole,
  TenantKind,
} from '@sso-platform/shared-types';

/**
 * Pure function that maps (platform role, active-tenant membership, tenant kind)
 * into the capability set both consoles consume.
 *
 * Single source of truth for permission UX **and** for backend gating via
 * `RequireCapabilityGuard`. Frontend only reads `capabilities.includes(c)` —
 * it never re-derives. Backend enforcement is independent (guards, OpenFGA,
 * Prisma RLS); this function exists to keep both consoles + their backing
 * APIs aligned on a single vocabulary.
 *
 * Kept as a pure function (no I/O, no NestJS decorators) so unit tests can
 * drive every row of the matrix deterministically. Lives in libs/nestjs-auth
 * so any NestJS service can import the same matrix the guard already uses.
 *
 * Matrix history: originally at apps/admin-api/src/session/capabilities.ts
 * (admin-console only). Moved here as part of ADR-0002 unified RBAC; the
 * developer-portal capabilities (manage_api_keys, manage_oauth_apps,
 * manage_webhooks, manage_scim_tokens, view_developer_resources) extend
 * the same matrix.
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
    // Read-tier members cap: any active organization membership can see
    // the team list (deferred-roadmap Item 1.2 split from manage_members).
    if (role) {
      caps.add('read_members');
    }
  }

  if (kind === 'personal' && role === 'owner') {
    // Individual-tier users see only a simplified settings surface on their
    // personal tenant. Plan decision: redirect admin-only pages to /dashboard.
    caps.add('view_tenant_settings');
  }

  // --- Developer-portal capabilities (ADR-0002 §A2) -------------------
  // These gate the developer-portal nav + writes on developer-portal-api.
  // Same role → cap mapping applies regardless of tenant kind: a developer
  // working in a personal tenant still gets the same API key management as
  // a developer working in an organization (the underlying resources are
  // tenant-scoped either way).

  // Anyone with an active membership can view their developer resources.
  if (role) {
    caps.add('view_developer_resources');
    // Read-tier developer caps gate GET list/detail routes — additive split
    // from manage_* so billing_manager and readonly can audit usage without
    // inheriting writeful manage_* below (deferred-roadmap Item 1.2).
    caps.add('read_api_keys');
    caps.add('read_oauth_apps');
    caps.add('read_webhooks');
  }

  // Write-shaped developer surfaces: owner, admin, and member can manage
  // API keys, OAuth apps, and webhooks. billing_manager and readonly are
  // explicitly excluded (read-only on their developer-portal session).
  if (role === 'owner' || role === 'admin' || role === 'member') {
    caps.add('manage_api_keys');
    caps.add('manage_oauth_apps');
    caps.add('manage_webhooks');
  }

  // SCIM tokens carry broad provisioning privileges — restrict to tenant
  // admins. This is the cap that closes the original security gap: a
  // `readonly` user with a valid session can no longer create SCIM tokens
  // via curl now that developer-portal-api enforces this server-side.
  if (role === 'owner' || role === 'admin') {
    caps.add('manage_scim_tokens');
  }

  return Array.from(caps).sort();
}
