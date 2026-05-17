import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import type { Capability } from '@sso-platform/shared-types';
import { SessionStore } from '../core/session/session.store';

/**
 * Returns a guard that allows activation iff the current session holds ANY
 * of the supplied capabilities. Otherwise redirects to `/dashboard` — gated
 * only by `authGuard`, so always reachable for an authenticated user.
 *
 * Capabilities are unioned (any-of), not intersected, so a page that's
 * visible to both `manage_api_keys` and `view_developer_resources` lists
 * both and either satisfies the guard. Matches admin-console's identical
 * pattern (the function is duplicated rather than shared because each
 * console's SessionStore is its own provider tree).
 *
 * Backend enforcement is independent — this guard is UX only. A bypass
 * (disabled JS, crafted URL) still 403s on the next mutation thanks to
 * developer-portal-api's `RequireCapabilityGuard`.
 */
export function requireCapability(caps: Capability[]): CanActivateFn {
	return () => {
		const store = inject(SessionStore);
		const router = inject(Router);
		if (caps.some((c) => store.capabilities().includes(c))) return true;
		try {
			const messages = inject(MessageService, { optional: true });
			messages?.add({
				severity: 'warn',
				summary: 'Not available',
				detail: "You don't have permission to view that page.",
				life: 4000,
			});
		} catch {
			// MessageService not provided yet (deep link with no layout) — fall
			// through to a silent redirect. A7 fix.
		}
		return router.createUrlTree(['/dashboard']);
	};
}
