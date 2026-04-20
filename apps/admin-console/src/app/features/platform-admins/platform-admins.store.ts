import { computed, inject } from '@angular/core';
import {
	patchState,
	signalStore,
	withComputed,
	withMethods,
	withState,
} from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import type { PlatformAdminRole } from '@sso-platform/shared-types';
import { SessionStore } from '../../core/session/session.store';
import {
	PlatformAdminsService,
	type GrantPlatformAdminPayload,
} from './platform-admins.service';

interface PlatformAdminsState {
	dialogOpen: boolean;
	submitting: boolean;
	error: string | null;
	/** Mutation counter — bump in component to trigger resource() reload. */
	mutationVersion: number;
	/** Form fields, mirrored here so the dialog opens with a clean slate. */
	formUserId: string;
	formRole: PlatformAdminRole;
	formNotes: string;
}

const initialState: PlatformAdminsState = {
	dialogOpen: false,
	submitting: false,
	error: null,
	mutationVersion: 0,
	formUserId: '',
	formRole: 'support',
	formNotes: '',
};

/**
 * Holds dialog + mutation state for the Platform Admins page. Reads stay in
 * the component via httpResource() / firstValueFrom() against the service.
 *
 * Per plan v2 D5: store owns mutations, component owns reads. After a
 * successful grant/revoke we bump `mutationVersion` so the component's
 * resource() — which depends on it — reloads automatically.
 */
export const PlatformAdminsStore = signalStore(
	withState(initialState),
	withComputed((state) => {
		const session = inject(SessionStore);
		return {
			canMutate: computed(() =>
				session.capabilities().includes('manage_platform_admins'),
			),
		};
	}),
	withMethods((store) => {
		const svc = inject(PlatformAdminsService);
		const session = inject(SessionStore);

		return {
			openDialog(): void {
				patchState(store, {
					dialogOpen: true,
					error: null,
					formUserId: '',
					formRole: 'support',
					formNotes: '',
				});
			},
			closeDialog(): void {
				patchState(store, { dialogOpen: false });
			},
			setUserId(id: string): void {
				patchState(store, { formUserId: id, error: null });
			},
			setRole(role: PlatformAdminRole): void {
				patchState(store, { formRole: role });
			},
			setNotes(notes: string): void {
				patchState(store, { formNotes: notes });
			},
			async submitGrant(): Promise<boolean> {
				const userId = store.formUserId().trim();
				if (!userId) {
					patchState(store, { error: 'User ID is required' });
					return false;
				}
				const payload: GrantPlatformAdminPayload = {
					userId,
					role: store.formRole(),
					notes: store.formNotes().trim() || undefined,
				};
				patchState(store, { submitting: true, error: null });
				try {
					await firstValueFrom(svc.grant(payload));
					patchState(store, {
						submitting: false,
						dialogOpen: false,
						mutationVersion: store.mutationVersion() + 1,
					});
					// If we just changed our own grant, refresh the session caps
					// so the sidebar reflects new privileges immediately.
					if (session.user()?.id === userId) {
						await session.reload();
					}
					return true;
				} catch (err) {
					patchState(store, {
						submitting: false,
						error: parseHttpError(err),
					});
					return false;
				}
			},
			async revoke(userId: string): Promise<boolean> {
				patchState(store, { submitting: true, error: null });
				try {
					await firstValueFrom(svc.revoke(userId));
					patchState(store, {
						submitting: false,
						mutationVersion: store.mutationVersion() + 1,
					});
					// Self-revoke would 409 server-side, but if any other admin
					// revoked us we want the sidebar to drop platform entries.
					if (session.user()?.id === userId) {
						await session.reload();
					}
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
		const e = err as { error?: { message?: string }; message?: string };
		return e.error?.message ?? e.message ?? 'Request failed';
	}
	return 'Request failed';
}
