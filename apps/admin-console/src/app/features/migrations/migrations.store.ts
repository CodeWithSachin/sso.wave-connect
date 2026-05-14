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
import { MigrationsService } from './migrations.service';

interface MigrationsState {
	notifyingId: string | null;
	forcingId: string | null;
	error: string | null;
	mutationVersion: number;
}

const initialState: MigrationsState = {
	notifyingId: null,
	forcingId: null,
	error: null,
	mutationVersion: 0,
};

/**
 * Mutation state for the Migrations page. Reads stay in the component via
 * resource(); mutations live here.
 *
 * Per plan v2 capability matrix:
 *   - `view_migrations` lets owner+admin see the table.
 *   - `force_migration` is owner-only; the Force button is hidden for admins.
 */
export const MigrationsStore = signalStore(
	withState(initialState),
	withComputed(() => {
		const session = inject(SessionStore);
		return {
			activeTenantId: computed(() => session.activeTenant()?.id ?? null),
			canView: computed(() =>
				session.capabilities().includes('view_migrations'),
			),
			canForce: computed(() =>
				session.capabilities().includes('force_migration'),
			),
		};
	}),
	withMethods((store) => {
		const svc = inject(MigrationsService);

		return {
			clearError(): void {
				patchState(store, { error: null });
			},
			async notifyForce(migrationId: string): Promise<boolean> {
				const tenantId = store.activeTenantId();
				if (!tenantId) return false;
				patchState(store, { notifyingId: migrationId, error: null });
				try {
					await firstValueFrom(svc.notifyForce(tenantId, migrationId));
					patchState(store, {
						notifyingId: null,
						mutationVersion: store.mutationVersion() + 1,
					});
					return true;
				} catch (err) {
					patchState(store, {
						notifyingId: null,
						error: parseHttpError(err),
					});
					return false;
				}
			},
			async force(migrationId: string): Promise<boolean> {
				const tenantId = store.activeTenantId();
				if (!tenantId) return false;
				patchState(store, { forcingId: migrationId, error: null });
				try {
					await firstValueFrom(svc.force(tenantId, migrationId));
					patchState(store, {
						forcingId: null,
						mutationVersion: store.mutationVersion() + 1,
					});
					return true;
				} catch (err) {
					patchState(store, {
						forcingId: null,
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
		if (e.status === 409) {
			return 'Force-notice was sent less than 7 days ago.';
		}
		return e.message ?? 'Request failed';
	}
	return 'Request failed';
}
