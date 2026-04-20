import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import type { Capability } from '@sso-platform/shared-types';
import { SessionStore } from '../core/session/session.store';

/**
 * Returns a guard that allows activation iff the current session holds ANY
 * of the supplied capabilities. Otherwise redirects to /dashboard (which is
 * gated only by `authGuard` — always safe to send any authenticated user).
 *
 * Capabilities are a union, not an intersection, to keep the route list
 * readable: a page visible to both owners AND support admins lists both
 * caps and either satisfies the guard.
 *
 * Backend enforcement is independent; this guard is UX only. A user who
 * bypasses the guard (disabled JS, crafted URL) will still 403 from
 * admin-api on any mutation.
 */
export function requireCapability(caps: Capability[]): CanActivateFn {
  return () => {
    const store = inject(SessionStore);
    const router = inject(Router);
    return caps.some((c) => store.capabilities().includes(c))
      ? true
      : router.createUrlTree(['/dashboard']);
  };
}
