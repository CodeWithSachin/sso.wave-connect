import type {
  Capability,
  MembershipRole,
  TenantKind,
} from '@sso-platform/shared-types';
import { describe, expect, it } from 'vitest';
import { computeCapabilities } from './capabilities.js';

// Source-of-truth tests for the unified RBAC matrix (ADR-0002). If this file
// fails, the docs (docs/architecture/rbac.md) + Angular tests + this function
// are out of sync — update all three together.
describe('computeCapabilities', () => {
  describe('platform tier', () => {
    it('superadmin (no active tenant) has platform caps + audit', () => {
      const caps = computeCapabilities({
        platformRole: 'superadmin',
        activeMembershipRole: null,
        activeTenantKind: null,
      });
      expect(caps).toEqual(
        expect.arrayContaining([
          'view_platform_admins',
          'manage_platform_admins',
          'view_tenant_settings',
          'view_audit_log',
        ]),
      );
      expect(caps).not.toContain('manage_members');
      // Platform-only role with no membership ⇒ no developer caps.
      expect(caps).not.toContain('view_developer_resources');
      expect(caps).not.toContain('manage_api_keys');
    });

    it('support can view platform admins but not manage them', () => {
      const caps = computeCapabilities({
        platformRole: 'support',
        activeMembershipRole: null,
        activeTenantKind: null,
      });
      expect(caps).toContain('view_platform_admins');
      expect(caps).not.toContain('manage_platform_admins');
      expect(caps).toContain('view_audit_log');
    });

    it('readonly platform role only sees audit log', () => {
      const caps = computeCapabilities({
        platformRole: 'readonly',
        activeMembershipRole: null,
        activeTenantKind: null,
      });
      expect(caps).toEqual(['view_audit_log']);
    });
  });

  describe('tenant-admin tier (organization)', () => {
    it('owner gets full tenant-admin set + force_migration + writeful developer caps', () => {
      const caps = computeCapabilities({
        platformRole: null,
        activeMembershipRole: 'owner',
        activeTenantKind: 'organization',
      });
      expect(caps).toEqual(
        expect.arrayContaining([
          'view_tenant_settings',
          'read_members',
          'manage_members',
          'manage_domains',
          'manage_identity_providers',
          'manage_invitations',
          'view_migrations',
          'view_audit_log',
          'force_migration',
          // developer-tier caps follow the membership role
          'view_developer_resources',
          'read_api_keys',
          'manage_api_keys',
          'read_oauth_apps',
          'manage_oauth_apps',
          'read_webhooks',
          'manage_webhooks',
          'manage_scim_tokens',
        ]),
      );
      expect(caps).not.toContain('manage_platform_admins');
    });

    it('admin matches owner minus force_migration', () => {
      const caps = computeCapabilities({
        platformRole: null,
        activeMembershipRole: 'admin',
        activeTenantKind: 'organization',
      });
      expect(caps).toContain('manage_members');
      expect(caps).toContain('read_members');
      expect(caps).toContain('manage_scim_tokens');
      expect(caps).not.toContain('force_migration');
    });

    it('member has writeful developer caps but no tenant-admin caps and no SCIM', () => {
      const caps = computeCapabilities({
        platformRole: null,
        activeMembershipRole: 'member',
        activeTenantKind: 'organization',
      });
      // Tenant admin gates closed
      expect(caps).not.toContain('manage_members');
      expect(caps).not.toContain('manage_domains');
      // Developer-tier opens up except SCIM (admin-only)
      expect(caps).toEqual(
        expect.arrayContaining([
          'view_developer_resources',
          'read_api_keys',
          'manage_api_keys',
          'read_oauth_apps',
          'manage_oauth_apps',
          'read_webhooks',
          'manage_webhooks',
          // read tier on members opens to any active org membership
          'read_members',
        ]),
      );
      expect(caps).not.toContain('manage_scim_tokens');
    });

    it('billing_manager is read-only on the developer surface', () => {
      const caps = computeCapabilities({
        platformRole: null,
        activeMembershipRole: 'billing_manager',
        activeTenantKind: 'organization',
      });
      expect(caps).toContain('view_developer_resources');
      // Read-tier developer caps open for billing audit; writes stay closed.
      expect(caps).toContain('read_api_keys');
      expect(caps).toContain('read_oauth_apps');
      expect(caps).toContain('read_webhooks');
      expect(caps).toContain('read_members');
      expect(caps).not.toContain('manage_api_keys');
      expect(caps).not.toContain('manage_oauth_apps');
      expect(caps).not.toContain('manage_webhooks');
      expect(caps).not.toContain('manage_members');
      expect(caps).not.toContain('manage_scim_tokens');
    });

    it('readonly sees audit log + the new read-tier caps', () => {
      const caps = computeCapabilities({
        platformRole: null,
        activeMembershipRole: 'readonly',
        activeTenantKind: 'organization',
      });
      // readonly within an org gets the audit shell plus every read_* cap;
      // every manage_* stays closed (Item 1.2 split clarifies this surface).
      expect(caps).toEqual(
        expect.arrayContaining([
          'view_audit_log',
          'view_developer_resources',
          'read_members',
          'read_api_keys',
          'read_oauth_apps',
          'read_webhooks',
        ]),
      );
      expect(caps).not.toContain('manage_members');
      expect(caps).not.toContain('manage_api_keys');
      expect(caps).not.toContain('manage_scim_tokens');
    });
  });

  describe('personal tenant', () => {
    it('owner sees view_tenant_settings + writeful developer caps', () => {
      const caps = computeCapabilities({
        platformRole: null,
        activeMembershipRole: 'owner',
        activeTenantKind: 'personal',
      });
      expect(caps).toContain('view_tenant_settings');
      // Developer caps follow the membership role, not the tenant kind.
      expect(caps).toContain('read_api_keys');
      expect(caps).toContain('manage_api_keys');
      expect(caps).toContain('read_oauth_apps');
      expect(caps).toContain('manage_oauth_apps');
      expect(caps).toContain('read_webhooks');
      expect(caps).toContain('manage_webhooks');
      expect(caps).toContain('manage_scim_tokens');
      // Personal tenant has no org-admin surface — no members, no read_members.
      expect(caps).not.toContain('manage_members');
      expect(caps).not.toContain('read_members');
      expect(caps).not.toContain('manage_domains');
    });
  });

  describe('union — platform admin + tenant membership', () => {
    it('superadmin + org owner: both tiers grant simultaneously', () => {
      const caps = computeCapabilities({
        platformRole: 'superadmin',
        activeMembershipRole: 'owner',
        activeTenantKind: 'organization',
      });
      expect(caps).toContain('manage_platform_admins'); // platform
      expect(caps).toContain('manage_members'); // tenant admin
      expect(caps).toContain('force_migration'); // owner bonus
      expect(caps).toContain('manage_scim_tokens'); // developer tier
    });
  });

  describe('invariants', () => {
    it('returns a sorted, de-duplicated list', () => {
      const caps = computeCapabilities({
        platformRole: 'superadmin',
        activeMembershipRole: 'admin',
        activeTenantKind: 'organization',
      });
      const sorted = [...caps].sort();
      expect(caps).toEqual(sorted);
      expect(new Set(caps).size).toBe(caps.length);
    });

    it('no membership + no platform role ⇒ empty set', () => {
      const caps = computeCapabilities({
        platformRole: null,
        activeMembershipRole: null,
        activeTenantKind: null,
      });
      expect(caps).toEqual([]);
    });
  });

  // The 4-cap split (Item 1.2) must be additive: every existing manage_*
  // grant must come with its matching read_* grant. If this invariant fails
  // we've reintroduced the kind of UX gap the split was meant to close.
  describe('cap-split invariants (Item 1.2)', () => {
    const READ_FOR_MANAGE: Record<string, string> = {
      manage_members: 'read_members',
      manage_api_keys: 'read_api_keys',
      manage_oauth_apps: 'read_oauth_apps',
      manage_webhooks: 'read_webhooks',
    };

    const roles: Array<MembershipRole | null> = [
      'owner',
      'admin',
      'member',
      'billing_manager',
      'readonly',
      null,
    ];
    const kinds: Array<TenantKind | null> = ['organization', 'personal', null];

    it('manage_* implies read_* across every role × tenant_kind combo', () => {
      for (const role of roles) {
        for (const kind of kinds) {
          const caps = computeCapabilities({
            platformRole: null,
            activeMembershipRole: role,
            activeTenantKind: kind,
          });
          for (const [manageCap, readCap] of Object.entries(READ_FOR_MANAGE)) {
            if (caps.includes(manageCap as Capability)) {
              expect(caps, `${role}/${kind} has ${manageCap} but missing ${readCap}`)
                .toContain(readCap as Capability);
            }
          }
        }
      }
    });

    it('personal tenant never grants read_members (no team surface there)', () => {
      for (const role of roles) {
        const caps = computeCapabilities({
          platformRole: null,
          activeMembershipRole: role,
          activeTenantKind: 'personal',
        });
        expect(caps, `personal/${role}`).not.toContain('read_members');
      }
    });

    it('billing_manager: exactly the read tier, no write surface', () => {
      const caps = computeCapabilities({
        platformRole: null,
        activeMembershipRole: 'billing_manager',
        activeTenantKind: 'organization',
      });
      // Read-tier caps fully open
      for (const readCap of [
        'read_members',
        'read_api_keys',
        'read_oauth_apps',
        'read_webhooks',
      ] as const) {
        expect(caps).toContain(readCap);
      }
      // Every manage_* stays closed for billing_manager
      for (const manageCap of [
        'manage_members',
        'manage_api_keys',
        'manage_oauth_apps',
        'manage_webhooks',
        'manage_scim_tokens',
        'manage_domains',
        'manage_identity_providers',
        'manage_invitations',
        'manage_platform_admins',
      ] as const) {
        expect(caps, `billing_manager should not have ${manageCap}`).not.toContain(manageCap);
      }
    });

    it('platform-only role (no membership) does not inherit member-scoped reads', () => {
      const caps = computeCapabilities({
        platformRole: 'superadmin',
        activeMembershipRole: null,
        activeTenantKind: null,
      });
      // Read-tier caps are tenant/membership-scoped — a superadmin without
      // an active membership should not silently get them.
      expect(caps).not.toContain('read_members');
      expect(caps).not.toContain('read_api_keys');
      expect(caps).not.toContain('read_oauth_apps');
      expect(caps).not.toContain('read_webhooks');
    });
  });
});
