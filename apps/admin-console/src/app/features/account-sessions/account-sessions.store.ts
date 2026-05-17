import { inject } from '@angular/core';
import {
	patchState,
	signalStore,
	withHooks,
	withMethods,
	withState,
} from '@ngrx/signals';
import { MessageService } from 'primeng/api';
import { firstValueFrom } from 'rxjs';
import { AccountSessionsService, type SessionRow } from './account-sessions.service';

interface AccountSessionsState {
	sessions: SessionRow[];
	loading: boolean;
	error: string | null;
	revokingId: string | null;
}

/**
 * Holds the list of the current user's active sessions and revoke-in-flight
 * state. Initial load fires on hook init; subsequent loads after a revoke
 * are explicit so the user sees the row disappear without a flicker.
 */
export const AccountSessionsStore = signalStore(
	withState<AccountSessionsState>({
		sessions: [],
		loading: true,
		error: null,
		revokingId: null,
	}),
	withMethods((store) => {
		const svc = inject(AccountSessionsService);
		const msg = inject(MessageService);
		return {
			async load(): Promise<void> {
				patchState(store, { loading: true, error: null });
				try {
					const res = await firstValueFrom(svc.list());
					patchState(store, { sessions: res?.sessions ?? [], loading: false });
				} catch (err) {
					patchState(store, { loading: false, error: parseHttpError(err) });
				}
			},
			async revoke(id: string): Promise<void> {
				patchState(store, { revokingId: id });
				try {
					await firstValueFrom(svc.revoke(id));
					msg.add({
						severity: 'success',
						summary: 'Session revoked',
						detail: 'The remote session is now invalid.',
					});
					patchState(store, {
						revokingId: null,
						sessions: store.sessions().filter((s) => s.id !== id),
					});
				} catch (err) {
					patchState(store, { revokingId: null });
					msg.add({
						severity: 'error',
						summary: 'Revoke failed',
						detail: parseHttpError(err),
					});
				}
			},
		};
	}),
	withHooks({
		onInit(store) {
			store.load();
		},
	}),
);

function parseHttpError(err: unknown): string {
	if (typeof err === 'object' && err !== null) {
		const e = err as { error?: { error?: string }; message?: string };
		if (e.error?.error) return e.error.error;
		return e.message ?? 'Request failed';
	}
	return 'Request failed';
}
