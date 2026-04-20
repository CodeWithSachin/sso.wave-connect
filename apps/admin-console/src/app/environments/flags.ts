import type { FeatureFlags } from '@sso-platform/shared-types';

/**
 * Runtime feature flags for admin-console. Values come from Vite env vars at
 * build time — `VITE_FLAG_*=true` flips a flag on. Default everything off so
 * merged-but-in-progress pages stay invisible until we flip them.
 *
 * Route guards pair flag checks with capability checks:
 *   canActivate: [authGuard, requireCapability([...]), requireFlag('domainsPage')]
 *
 * Flipping a flag is the only supported way to enable a page; there is no
 * per-user or runtime override. If a user needs access, give them the
 * capability and enable the flag in their environment.
 */

// Vite types aren't on the workspace tsconfig — narrow `import.meta.env` here
// once so the FeatureFlags shape below stays declarative.
const env = (import.meta as unknown as { env?: Record<string, string | undefined> })
  .env ?? {};
const flag = (key: string): boolean => env[key] === 'true';

export const flags: FeatureFlags = {
  platformAdmins: flag('VITE_FLAG_PLATFORM_ADMINS'),
  domainsPage: flag('VITE_FLAG_DOMAINS'),
  ssoPage: flag('VITE_FLAG_SSO'),
  invitationsPage: flag('VITE_FLAG_INVITATIONS'),
  migrationsPage: flag('VITE_FLAG_MIGRATIONS'),
};
