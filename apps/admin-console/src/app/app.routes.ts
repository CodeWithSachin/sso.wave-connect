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
          import('./features/dashboard/dashboard.component').then(
            (m) => m.DashboardComponent,
          ),
      },
      {
        path: 'users',
        loadComponent: () =>
          import('./features/users/users.component').then(
            (m) => m.UsersComponent,
          ),
      },
      {
        path: 'groups',
        loadComponent: () =>
          import('./features/groups/groups.component').then(
            (m) => m.GroupsComponent,
          ),
      },
      {
        path: 'policies',
        loadComponent: () =>
          import('./features/policies/policies.component').then(
            (m) => m.PoliciesComponent,
          ),
      },
      {
        path: 'webhooks',
        loadComponent: () =>
          import('./features/webhooks/webhooks.component').then(
            (m) => m.WebhooksComponent,
          ),
      },
      {
        path: 'audit',
        loadComponent: () =>
          import('./features/audit/audit.component').then(
            (m) => m.AuditComponent,
          ),
      },
      {
        path: 'scim',
        loadComponent: () =>
          import('./features/scim/scim.component').then(
            (m) => m.ScimComponent,
          ),
      },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
    ],
  },
  { path: '**', redirectTo: '' },
];
