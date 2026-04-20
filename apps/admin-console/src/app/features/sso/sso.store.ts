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
	SsoService,
	type CreateOidcPayload,
	type CreateSamlPayload,
	type IdpTestResult,
} from './sso.service';

/** Which form is showing in the create dialog. */
export type IdpFormVariant = 'saml' | 'oidc';

interface SsoState {
	dialogOpen: boolean;
	formVariant: IdpFormVariant;
	submitting: boolean;
	error: string | null;
	mutationVersion: number;
	/** Per-row test results keyed by IdP id. Cleared on a fresh test attempt. */
	testResults: Record<string, IdpTestResult>;
	/** Id of the row currently being tested (so the row can show a spinner). */
	testingId: string | null;
}

const initialState: SsoState = {
	dialogOpen: false,
	formVariant: 'oidc',
	submitting: false,
	error: null,
	mutationVersion: 0,
	testResults: {},
	testingId: null,
};

/**
 * Mutation + dialog state for the SSO page. Reads stay in the component via
 * resource(); mutations live here. The component bumps `resource.reload()`
 * whenever `mutationVersion` changes.
 */
export const SsoStore = signalStore(
	withState(initialState),
	withComputed(() => {
		const session = inject(SessionStore);
		return {
			canMutate: computed(() =>
				session.capabilities().includes('manage_identity_providers'),
			),
		};
	}),
	withMethods((store) => {
		const svc = inject(SsoService);

		return {
			openDialog(variant: IdpFormVariant): void {
				patchState(store, {
					dialogOpen: true,
					formVariant: variant,
					error: null,
				});
			},
			closeDialog(): void {
				patchState(store, { dialogOpen: false });
			},
			setVariant(v: IdpFormVariant): void {
				patchState(store, { formVariant: v });
			},
			async submitSaml(payload: CreateSamlPayload): Promise<boolean> {
				patchState(store, { submitting: true, error: null });
				try {
					await firstValueFrom(svc.createSaml(payload));
					patchState(store, {
						submitting: false,
						dialogOpen: false,
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
			async submitOidc(payload: CreateOidcPayload): Promise<boolean> {
				patchState(store, { submitting: true, error: null });
				try {
					await firstValueFrom(svc.createOidc(payload));
					patchState(store, {
						submitting: false,
						dialogOpen: false,
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
			async delete(id: string): Promise<boolean> {
				patchState(store, { submitting: true, error: null });
				try {
					await firstValueFrom(svc.delete(id));
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
			async test(id: string): Promise<void> {
				patchState(store, { testingId: id });
				try {
					const result = await firstValueFrom(svc.test(id));
					patchState(store, {
						testingId: null,
						testResults: { ...store.testResults(), [id]: result },
					});
				} catch (err) {
					patchState(store, {
						testingId: null,
						testResults: {
							...store.testResults(),
							[id]: { ok: false, details: parseHttpError(err) },
						},
					});
				}
			},
			clearError(): void {
				patchState(store, { error: null });
			},
		};
	}),
);

function parseHttpError(err: unknown): string {
	if (typeof err === 'object' && err !== null) {
		const e = err as { error?: { message?: string }; message?: string; status?: number };
		if (e.error?.message) return e.error.message;
		if (e.status === 409) return 'Conflict — possibly an IdP with that name exists.';
		if (e.status === 422) return 'Validation failed — check the form fields.';
		return e.message ?? 'Request failed';
	}
	return 'Request failed';
}
