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
	InvitationsService,
	type InvitationStatus,
} from './invitations.service';

interface InvitationsState {
	activeTab: InvitationStatus;
	submitting: boolean;
	error: string | null;
	mutationVersion: number;
	/** Per-row resend feedback so the UI can show "Sent ✓" briefly. */
	lastResent: Record<string, number>;
	/** Id of the row currently being resent. */
	resendingId: string | null;
}

const initialState: InvitationsState = {
	activeTab: 'pending',
	submitting: false,
	error: null,
	mutationVersion: 0,
	lastResent: {},
	resendingId: null,
};

/**
 * Holds tab + mutation state for the Invitations page. Reads stay in the
 * component via resource(); mutations live here.
 */
export const InvitationsStore = signalStore(
	withState(initialState),
	withComputed(() => {
		const session = inject(SessionStore);
		return {
			canMutate: computed(() =>
				session.capabilities().includes('manage_invitations'),
			),
		};
	}),
	withMethods((store) => {
		const svc = inject(InvitationsService);

		return {
			setTab(status: InvitationStatus): void {
				patchState(store, { activeTab: status, error: null });
			},
			clearError(): void {
				patchState(store, { error: null });
			},
			async resend(id: string): Promise<boolean> {
				patchState(store, { resendingId: id, error: null });
				try {
					await firstValueFrom(svc.resend(id));
					patchState(store, {
						resendingId: null,
						lastResent: { ...store.lastResent(), [id]: Date.now() },
						mutationVersion: store.mutationVersion() + 1,
					});
					return true;
				} catch (err) {
					patchState(store, {
						resendingId: null,
						error: parseHttpError(err),
					});
					return false;
				}
			},
			async revoke(id: string): Promise<boolean> {
				patchState(store, { submitting: true, error: null });
				try {
					await firstValueFrom(svc.revoke(id));
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

function parseHttpError(err: unknown): string {
	if (typeof err === 'object' && err !== null) {
		const e = err as { error?: { message?: string }; message?: string; status?: number };
		if (e.error?.message) return e.error.message;
		if (e.status === 409) return 'Already accepted — nothing to resend.';
		return e.message ?? 'Request failed';
	}
	return 'Request failed';
}
