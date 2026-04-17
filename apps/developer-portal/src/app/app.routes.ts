import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

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
        loadComponent: () =>
          import('./features/api-keys/api-keys.component').then((m) => m.ApiKeysComponent),
      },
      {
        path: 'oauth-apps',
        loadComponent: () =>
          import('./features/oauth-apps/oauth-apps.component').then((m) => m.OAuthAppsComponent),
      },
      {
        path: 'docs',
        loadComponent: () =>
          import('./features/docs/docs.component').then((m) => m.DocsComponent),
      },
      {
        path: 'scim',
        loadComponent: () =>
          import('./features/scim/scim.component').then((m) => m.ScimComponent),
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
