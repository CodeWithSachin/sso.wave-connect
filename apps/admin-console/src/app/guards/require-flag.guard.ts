import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import type { FeatureFlags } from '@sso-platform/shared-types';
import { flags } from '../environments/flags';

/**
 * Returns a guard that allows activation iff the named feature flag is on.
 * Flag off → redirect to /dashboard (same fail-soft destination as the
 * capability guard, so we never stack two redirects).
 *
 * Compose with `requireCapability([...])` on every dark-shipped route:
 *   canActivate: [authGuard, requireCapability([...]), requireFlag('domainsPage')]
 */
export function requireFlag(flag: keyof FeatureFlags): CanActivateFn {
  return () => flags[flag] || inject(Router).createUrlTree(['/dashboard']);
}
