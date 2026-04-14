import { Routes } from '@angular/router';

export const appRoutes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'register',
    loadComponent: () =>
      import('./register/register.component').then((m) => m.RegisterComponent),
  },
  // MFA
  {
    path: 'mfa/challenge',
    loadComponent: () =>
      import('./mfa/mfa-challenge.component').then(
        (m) => m.MfaChallengeComponent,
      ),
  },
  {
    path: 'mfa/backup',
    loadComponent: () =>
      import('./mfa/mfa-backup.component').then((m) => m.MfaBackupComponent),
  },
  // Password Reset
  {
    path: 'forgot-password',
    loadComponent: () =>
      import('./password-reset/forgot-password.component').then(
        (m) => m.ForgotPasswordComponent,
      ),
  },
  {
    path: 'reset-password',
    loadComponent: () =>
      import('./password-reset/reset-password.component').then(
        (m) => m.ResetPasswordComponent,
      ),
  },
  // OAuth2 Consent
  {
    path: 'consent',
    loadComponent: () =>
      import('./consent/consent.component').then((m) => m.ConsentComponent),
  },
  // Error
  {
    path: 'error',
    loadComponent: () =>
      import('./error/error.component').then((m) => m.ErrorComponent),
  },
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: '**', redirectTo: 'login' },
];
