import { describe, expect, it } from 'vitest';
import { computeCapabilities } from './capabilities';

// Cover every row of the matrix in docs/plans/admin-role-surfaces.md (plan v2).
// If this file fails, the docs + frontend tests + this function are out of sync —
// update all three together.
describe('computeCapabilities', () => {
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

  it('organization owner gets full tenant-admin capability set + force_migration', () => {
    const caps = computeCapabilities({
      platformRole: null,
      activeMembershipRole: 'owner',
      activeTenantKind: 'organization',
    });
    expect(caps).toEqual(
      expect.arrayContaining([
        'view_tenant_settings',
        'manage_members',
        'manage_domains',
        'manage_identity_providers',
        'manage_invitations',
        'view_migrations',
        'view_audit_log',
        'force_migration',
      ]),
    );
    expect(caps).not.toContain('manage_platform_admins');
  });

  it('organization admin matches owner but without force_migration', () => {
    const caps = computeCapabilities({
      platformRole: null,
      activeMembershipRole: 'admin',
      activeTenantKind: 'organization',
    });
    expect(caps).toContain('manage_members');
    expect(caps).toContain('manage_domains');
    expect(caps).toContain('view_migrations');
    expect(caps).not.toContain('force_migration');
  });

  it('organization member has no admin capabilities', () => {
    const caps = computeCapabilities({
      platformRole: null,
      activeMembershipRole: 'member',
      activeTenantKind: 'organization',
    });
    expect(caps).toEqual([]);
  });

  it('organization readonly sees audit log only', () => {
    const caps = computeCapabilities({
      platformRole: null,
      activeMembershipRole: 'readonly',
      activeTenantKind: 'organization',
    });
    expect(caps).toEqual(['view_audit_log']);
  });

  it('individual user (personal tenant owner) sees view_tenant_settings only', () => {
    const caps = computeCapabilities({
      platformRole: null,
      activeMembershipRole: 'owner',
      activeTenantKind: 'personal',
    });
    expect(caps).toEqual(['view_tenant_settings']);
  });

  it('superadmin + owner-of-org union: both platform and tenant caps granted', () => {
    const caps = computeCapabilities({
      platformRole: 'superadmin',
      activeMembershipRole: 'owner',
      activeTenantKind: 'organization',
    });
    expect(caps).toContain('manage_platform_admins'); // platform
    expect(caps).toContain('manage_members'); // tenant
    expect(caps).toContain('force_migration'); // owner bonus
  });

  it('returns a sorted, de-duplicated list', () => {
    const caps = computeCapabilities({
      platformRole: 'superadmin',
      activeMembershipRole: 'admin',
      activeTenantKind: 'organization',
    });
    // Sorted
    const sorted = [...caps].sort();
    expect(caps).toEqual(sorted);
    // Unique
    expect(new Set(caps).size).toBe(caps.length);
  });
});
