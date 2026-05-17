import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { requireCapability } from './guards/require-capability.guard';

/**
 * Developer-portal routes.
 *
 * Each protected route composes two guards:
 *   1. `authGuard` — already on the parent — bounces to login-portal if no
 *      sso_session cookie is present.
 *   2. `requireCapability([...])` — UX gate. A user without any of the
 *      named capabilities is sent to /dashboard rather than seeing a 403
 *      from the API on every action. Backend enforcement is independent.
 *
 * Routes without a `requireCapability` gate are auth-only (any signed-in
 * user reaches them regardless of role).
 */
export const appRoutes: Routes = [
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./layout/layout.component').then((m) => m.LayoutComponent),
    children: [
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'api-keys',
        // Item 1.2 split: read_api_keys is the precise read-tier cap;
        // view_developer_resources stays in the union for backward compat.
        canActivate: [
          requireCapability([
            'view_developer_resources',
            'read_api_keys',
            'manage_api_keys',
          ]),
        ],
        loadComponent: () =>
          import('./features/api-keys/api-keys.component').then((m) => m.ApiKeysComponent),
      },
      {
        path: 'api-keys/:id',
        canActivate: [
          requireCapability([
            'view_developer_resources',
            'read_api_keys',
            'manage_api_keys',
          ]),
        ],
        loadComponent: () =>
          import('./features/api-keys/api-key-detail.component').then(
            (m) => m.ApiKeyDetailComponent,
          ),
      },
      {
        path: 'oauth-apps',
        canActivate: [
          requireCapability([
            'view_developer_resources',
            'read_oauth_apps',
            'manage_oauth_apps',
          ]),
        ],
        loadComponent: () =>
          import('./features/oauth-apps/oauth-apps.component').then((m) => m.OAuthAppsComponent),
      },
      {
        path: 'webhooks',
        canActivate: [
          requireCapability([
            'view_developer_resources',
            'read_webhooks',
            'manage_webhooks',
          ]),
        ],
        loadComponent: () =>
          import('./features/webhooks/webhooks.component').then((m) => m.WebhooksComponent),
      },
      {
        path: 'webhooks/:id',
        canActivate: [
          requireCapability([
            'view_developer_resources',
            'read_webhooks',
            'manage_webhooks',
          ]),
        ],
        loadComponent: () =>
          import('./features/webhooks/webhook-deliveries.component').then(
            (m) => m.WebhookDeliveriesComponent,
          ),
      },
      {
        path: 'docs',
        // Docs are universally accessible to any signed-in user; no
        // capability gate.
        loadComponent: () =>
          import('./features/docs/docs.component').then((m) => m.DocsComponent),
      },
      {
        // SCIM token management is admin-only — broad provisioning surface.
        path: 'scim',
        canActivate: [requireCapability(['manage_scim_tokens'])],
        loadComponent: () =>
          import('./features/scim/scim.component').then((m) => m.ScimComponent),
      },
      {
        path: 'activity',
        // Activity is auth-only — every member can see their own audit tail.
        loadComponent: () =>
          import('./features/activity/activity.component').then(
            (m) => m.ActivityComponent,
          ),
      },
      {
        path: 'account',
        // Account view is auth-only — independent of membership role.
        loadComponent: () =>
          import('./features/account/account.component').then(
            (m) => m.AccountComponent,
          ),
      },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
    ],
  },
  {
    path: 'callback',
    loadComponent: () =>
      import('./callback/callback.component').then((m) => m.CallbackComponent),
  },
  { path: '**', redirectTo: '' },
];
