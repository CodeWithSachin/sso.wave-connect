import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import type { Capability } from '@sso-platform/shared-types';
import { SessionStore } from '../core/session/session.store';

/**
 * Returns a guard that allows activation iff the current session holds ANY
 * of the supplied capabilities. Otherwise redirects to /dashboard (which is
 * gated only by `authGuard` — always safe to send any authenticated user)
 * and emits a toast so the redirect isn't silent — previously the user just
 * silently landed on /dashboard with no explanation (A7).
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
    if (caps.some((c) => store.capabilities().includes(c))) return true;
    // PrimeNG MessageService is provided at the LayoutComponent level, so
    // injecting it here works only after the layout has mounted. Wrap in
    // try/catch so direct deep-links (where layout hasn't mounted yet)
    // still redirect cleanly even if the toast can't fire.
    try {
      const messages = inject(MessageService, { optional: true });
      messages?.add({
        severity: 'warn',
        summary: 'Not available',
        detail: 'You don\'t have permission to view that page.',
        life: 4000,
      });
    } catch {
      // Toast not wired (deep link on a fresh page load) — ignore.
    }
    return router.createUrlTree(['/dashboard']);
  };
}
