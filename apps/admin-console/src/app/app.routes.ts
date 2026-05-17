import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { requireCapability } from './guards/require-capability.guard';
import { requireFlag } from './guards/require-flag.guard';

/**
 * Top-level admin-console routes.
 *
 * Two route roots share one shell (`LayoutComponent`):
 *   - `''` — tenant context (Overview, Members, etc.)
 *   - `'platform'` — platform-admin context (super-admin only)
 *
 * Per plan v2 D6 (one-shell layout): the same `LayoutComponent` renders both
 * contexts; `SessionStore.mode()` swaps the sidebar entries and hides the
 * tenant chip when in platform mode.
 *
 * Every protected child route composes three guards:
 *   1. `authGuard` — bounces to sso-service if no sso_session.
 *   2. `requireCapability([...])` — UX gate; redirects to /dashboard if the
 *      caller doesn't hold any of the named capabilities.
 *   3. `requireFlag('...')` (only on dark-shipped pages) — env-gated, so
 *      merged-but-in-progress pages stay invisible until the flag flips.
 *
 * Backend enforcement is independent — these guards are UX only.
 */
export const appRoutes: Routes = [
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./layout/layout.component').then((m) => m.LayoutComponent),
    children: [
      {
        // /dashboard is the universal fallback the capability guard
        // redirects to. It must NOT require any capability beyond auth,
        // otherwise a denied route's redirect would itself be denied —
        // creating an infinite client-side loop. Members with zero admin
        // capabilities land here and see an empty sidebar (per layout's
        // navItems filter), which is the intended degraded UX.
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then(
            (m) => m.DashboardComponent,
          ),
      },
      {
        path: 'members',
        // Item 1.2 split: read_members lets billing_manager / readonly see
        // the team list without inheriting writeful manage_members.
        canActivate: [requireCapability(['read_members', 'manage_members'])],
        loadComponent: () =>
          import('./features/members/members.component').then(
            (m) => m.MembersComponent,
          ),
      },
      {
        path: 'members/:id',
        canActivate: [requireCapability(['read_members', 'manage_members'])],
        loadComponent: () =>
          import('./features/members/member-detail.component').then(
            (m) => m.MemberDetailComponent,
          ),
      },
      // Phase 8 (plan v2 D7) — preserve deep links from before the rename.
      // pathMatch: 'prefix' so /users/<uuid> redirects to /members/<uuid>.
      // Kept indefinitely; three lines, zero cost.
      { path: 'users', redirectTo: 'members', pathMatch: 'prefix' },
      {
        path: 'groups',
        canActivate: [requireCapability(['read_members', 'manage_members'])],
        loadComponent: () =>
          import('./features/groups/groups.component').then(
            (m) => m.GroupsComponent,
          ),
      },
      {
        path: 'groups/:id',
        canActivate: [requireCapability(['read_members', 'manage_members'])],
        loadComponent: () =>
          import('./features/groups/group-detail.component').then(
            (m) => m.GroupDetailComponent,
          ),
      },
      {
        path: 'policies',
        canActivate: [requireCapability(['manage_members'])],
        loadComponent: () =>
          import('./features/policies/policies.component').then(
            (m) => m.PoliciesComponent,
          ),
      },
      {
        path: 'webhooks',
        canActivate: [requireCapability(['manage_members'])],
        loadComponent: () =>
          import('./features/webhooks/webhooks.component').then(
            (m) => m.WebhooksComponent,
          ),
      },
      {
        path: 'audit',
        canActivate: [requireCapability(['view_audit_log'])],
        loadComponent: () =>
          import('./features/audit/audit.component').then(
            (m) => m.AuditComponent,
          ),
      },
      {
        path: 'scim',
        canActivate: [requireCapability(['manage_identity_providers'])],
        loadComponent: () =>
          import('./features/scim/scim.component').then(
            (m) => m.ScimComponent,
          ),
      },
      // /account/* — self-service routes available to any signed-in user
      // regardless of capability. authGuard at the parent route already
      // gates access; no requireCapability so a member with zero admin
      // caps can still manage their own sessions.
      {
        path: 'account/sessions',
        loadComponent: () =>
          import('./features/account-sessions/account-sessions.component').then(
            (m) => m.AccountSessionsComponent,
          ),
      },
      // /settings — self-service tenant editor. Tenant-admin role check
      // happens server-side on PATCH /api/v1/my-tenant; we gate the route
      // with manage_members which is the existing tenant-admin capability.
      {
        path: 'settings',
        canActivate: [requireCapability(['manage_members'])],
        loadComponent: () =>
          import('./features/settings/settings.component').then(
            (m) => m.SettingsComponent,
          ),
      },
      // ----- Phase 4–7 dark-shipped pages — flag-gated -----
      {
        path: 'domains',
        canActivate: [
          requireCapability(['manage_domains']),
          requireFlag('domainsPage'),
        ],
        loadComponent: () =>
          import('./features/domains/domains.component').then(
            (m) => m.DomainsComponent,
          ),
      },
      {
        path: 'sso',
        canActivate: [
          requireCapability(['manage_identity_providers']),
          requireFlag('ssoPage'),
        ],
        loadComponent: () =>
          import('./features/sso/sso.component').then((m) => m.SsoComponent),
      },
      {
        path: 'invitations',
        canActivate: [
          requireCapability(['manage_invitations']),
          requireFlag('invitationsPage'),
        ],
        loadComponent: () =>
          import('./features/invitations/invitations.component').then(
            (m) => m.InvitationsComponent,
          ),
      },
      {
        path: 'migrations',
        canActivate: [
          requireCapability(['view_migrations']),
          requireFlag('migrationsPage'),
        ],
        loadComponent: () =>
          import('./features/migrations/migrations.component').then(
            (m) => m.MigrationsComponent,
          ),
      },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
    ],
  },

  // ----- Platform context (super-admin only) -----
  {
    path: 'platform',
    canActivate: [
      authGuard,
      requireCapability(['view_platform_admins']),
    ],
    loadComponent: () =>
      import('./layout/layout.component').then((m) => m.LayoutComponent),
    children: [
      {
        path: 'admins',
        canActivate: [
          requireCapability(['view_platform_admins']),
          requireFlag('platformAdmins'),
        ],
        loadComponent: () =>
          import('./features/platform-admins/platform-admins.component').then(
            (m) => m.PlatformAdminsComponent,
          ),
      },
      {
        path: 'tenants',
        canActivate: [requireCapability(['view_platform_admins'])],
        loadComponent: () =>
          import('./features/platform-tenants/platform-tenants.component').then(
            (m) => m.PlatformTenantsComponent,
          ),
      },
      { path: '', redirectTo: 'admins', pathMatch: 'full' },
    ],
  },

  {
    path: 'callback',
    loadComponent: () =>
      import('./callback/callback.component').then(
        (m) => m.CallbackComponent,
      ),
  },
  { path: '**', redirectTo: '' },
];
