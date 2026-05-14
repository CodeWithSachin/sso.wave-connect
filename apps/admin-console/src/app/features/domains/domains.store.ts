import { computed, inject } from '@angular/core';
import {
	patchState,
	signalStore,
	withComputed,
	withMethods,
	withState,
} from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import { SessionStore } from '../../core/session/session.store';
import {
	DomainsService,
	type NewTenantDomain,
} from './domains.service';

interface DomainsState {
	dialogOpen: boolean;
	submitting: boolean;
	error: string | null;
	mutationVersion: number;
	formDomain: string;
	/** Server response from the most recent successful Add — used to surface the
	 *  TXT card once, without having to refetch the list with elevated perms. */
	lastCreated: NewTenantDomain | null;
	/** id of the row currently being verified (so the row can show a spinner). */
	verifyingId: string | null;
}

const initialState: DomainsState = {
	dialogOpen: false,
	submitting: false,
	error: null,
	mutationVersion: 0,
	formDomain: '',
	lastCreated: null,
	verifyingId: null,
};

/**
 * Holds dialog + verify + delete UI state for the Domains page. Reads stay
 * in the component via resource(); the store owns mutations and bumps
 * `mutationVersion` to force a list reload after success.
 *
 * Per plan v2 D2: backend enforces `manage_domains` (owner/admin) — this
 * gate is mirrored client-side via `canMutate`.
 */
export const DomainsStore = signalStore(
	withState(initialState),
	withComputed(() => {
		const session = inject(SessionStore);
		return {
			canMutate: computed(() =>
				session.capabilities().includes('manage_domains'),
			),
			activeTenantId: computed(() => session.activeTenant()?.id ?? null),
		};
	}),
	withMethods((store) => {
		const svc = inject(DomainsService);

		return {
			openDialog(): void {
				patchState(store, {
					dialogOpen: true,
					formDomain: '',
					lastCreated: null,
					error: null,
				});
			},
			closeDialog(): void {
				patchState(store, { dialogOpen: false });
			},
			setDomain(value: string): void {
				patchState(store, { formDomain: value, error: null });
			},
			dismissCreated(): void {
				patchState(store, { lastCreated: null });
			},
			async submitAdd(): Promise<boolean> {
				const tenantId = store.activeTenantId();
				if (!tenantId) {
					patchState(store, { error: 'No active tenant' });
					return false;
				}
				const domain = store.formDomain().trim().toLowerCase();
				if (!isLikelyDomain(domain)) {
					patchState(store, {
						error: 'Enter a domain like acme.com (no scheme, no path)',
					});
					return false;
				}
				patchState(store, { submitting: true, error: null });
				try {
					const created = await firstValueFrom(svc.add(tenantId, { domain }));
					patchState(store, {
						submitting: false,
						lastCreated: created,
						mutationVersion: store.mutationVersion() + 1,
					});
					return true;
				} catch (err) {
					patchState(store, {
						submitting: false,
						error: parseHttpError(err),
					});
					return false;
				}
			},
			async verify(domainId: string): Promise<string | null> {
				const tenantId = store.activeTenantId();
				if (!tenantId) return null;
				patchState(store, { verifyingId: domainId, error: null });
				try {
					const result = await firstValueFrom(svc.verify(tenantId, domainId));
					patchState(store, {
						verifyingId: null,
						mutationVersion: store.mutationVersion() + 1,
					});
					return result.outcome;
				} catch (err) {
					patchState(store, {
						verifyingId: null,
						error: parseHttpError(err),
					});
					return null;
				}
			},
			async delete(domainId: string): Promise<boolean> {
				const tenantId = store.activeTenantId();
				if (!tenantId) return false;
				patchState(store, { submitting: true, error: null });
				try {
					await firstValueFrom(svc.delete(tenantId, domainId));
					patchState(store, {
						submitting: false,
						mutationVersion: store.mutationVersion() + 1,
					});
					return true;
				} catch (err) {
					patchState(store, {
						submitting: false,
						error: parseHttpError(err),
					});
					return false;
				}
			},
		};
	}),
);

function isLikelyDomain(value: string): boolean {
	if (value.length < 4 || value.length > 255) return false;
	// Reject anything that looks like a URL or email — backend would reject too,
	// but cheap to catch up front for cleaner UX.
	if (value.includes('@') || value.includes('/') || value.includes(':'))
		return false;
	// Must contain at least one dot and only valid hostname chars.
	return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(value);
}

function parseHttpError(err: unknown): string {
	if (typeof err === 'object' && err !== null) {
		const e = err as {
			error?: { message?: string; error?: string };
			message?: string;
			status?: number;
		};
		if (e.error?.message) return e.error.message;
		if (e.error?.error === 'domain_already_claimed') {
			return 'This domain is already verified by another workspace.';
		}
		if (e.status === 429) return 'Too many verify attempts. Try again later.';
		return e.message ?? 'Request failed';
	}
	return 'Request failed';
}
