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
  // Tenantless consumer signup (Phase 1 of dual-product onboarding).
  {
    path: 'signup',
    loadComponent: () =>
      import('./signup/signup.component').then((m) => m.SignupComponent),
  },
  // Email-verification landing: ?token=... consumes; ?pending=1 waits.
  {
    path: 'verify-email',
    loadComponent: () =>
      import('./verify-email/verify-email.component').then(
        (m) => m.VerifyEmailComponent,
      ),
  },
  // Org-signup + DNS domain-claim flow (Phase 2).
  {
    path: 'signup-org',
    loadComponent: () =>
      import('./signup-org/signup-org.component').then((m) => m.SignupOrgComponent),
  },
  {
    path: 'signup-org/verify-domain',
    loadComponent: () =>
      import('./signup-org/verify-domain.component').then((m) => m.VerifyDomainComponent),
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
  // Phase 4: post-claim migration accept/decline landing.
  {
    path: 'migration/:token',
    loadComponent: () =>
      import('./migration/migration.component').then((m) => m.MigrationComponent),
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
