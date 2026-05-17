import { computed, inject } from '@angular/core';
import {
	patchState,
	signalStore,
	withComputed,
	withHooks,
	withMethods,
	withState,
} from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import type {
	Capability,
	SessionMeDto,
	SessionMeMembership,
	SessionMePlatform,
} from '@sso-platform/shared-types';
import { SessionService } from './session.service';

const ABORTED = Symbol('hydrate-aborted');

interface SessionState {
	user: SessionMeDto['user'] | null;
	session: SessionMeDto['session'] | null;
	activeTenant: SessionMeDto['activeTenant'];
	memberships: SessionMeMembership[];
	platformAdmin: SessionMePlatform | null;
	capabilities: Capability[];
	loading: boolean;
	hydrated: boolean;
	error: string | null;
}

const initialState: SessionState = {
	user: null,
	session: null,
	activeTenant: null,
	memberships: [],
	platformAdmin: null,
	capabilities: [],
	loading: false,
	hydrated: false,
	error: null,
};

/** Poll cadence — match admin-console (ADR-0002 §C1). */
const POLL_MS = 30_000;
/** Bootstrap deadline; layout falls through with `capabilities=[]` after this. */
const HYDRATE_TIMEOUT_MS = 3_000;

/**
 * Authenticated-session source of truth for the developer-portal shell.
 *
 * Same shape as admin-console's SessionStore by design — both consoles
 * consume the identical `SessionMeDto` from their own NestJS service's
 * `GET /api/v1/session/me`. The shared
 * `requireCapability(...)` route guard reads from this store, and the
 * sidebar nav filter is a single `caps.includes(...)` check.
 *
 * No `mode` field here (developer-portal has no platform shell — that's an
 * admin-console-only concept).
 */
export const SessionStore = signalStore(
	{ providedIn: 'root' },
	withState(initialState),
	withComputed((state) => ({
		isAuthenticated: computed(() => !!state.user()),
		isPlatformAdmin: computed(() => !!state.platformAdmin()),
		/** Convenience for guards + UI visibility predicates. */
		hasCapability: computed(() => {
			const caps = state.capabilities();
			return (c: Capability) => caps.includes(c);
		}),
		activeMembership: computed(
			() => state.memberships().find((m) => m.isActive) ?? null,
		),
	})),
	withMethods((store) => {
		const svc = inject(SessionService);
		let pollHandle: ReturnType<typeof setInterval> | null = null;

		// Wrap the fetch so a slow response can't clobber a deliberate
		// timeout-state write that fired first.
		async function loadOnce(aborted?: { value: boolean }): Promise<typeof ABORTED | void> {
			try {
				const dto = await firstValueFrom(svc.getMe());
				if (aborted?.value) return ABORTED;
				patchState(store, {
					user: dto.user,
					session: dto.session,
					activeTenant: dto.activeTenant,
					memberships: dto.memberships,
					platformAdmin: dto.platform,
					capabilities: dto.capabilities,
					loading: false,
					hydrated: true,
					error: null,
				});
			} catch (err) {
				if (aborted?.value) return ABORTED;
				patchState(store, {
					loading: false,
					hydrated: true,
					error: (err as Error).message ?? 'Failed to load session',
				});
			}
			return undefined;
		}

		return {
			/**
			 * Called from `provideAppInitializer`. Races a 3 s deadline — on
			 * timeout the shell renders with `capabilities=[]` and the
			 * capability guard sends any protected route to /dashboard.
			 */
			async hydrate(): Promise<void> {
				patchState(store, { loading: true });
				const aborted = { value: false };
				await Promise.race([
					loadOnce(aborted),
					new Promise<void>((resolve) =>
						setTimeout(() => {
							if (!store.hydrated()) {
								aborted.value = true;
								patchState(store, {
									loading: false,
									hydrated: true,
									error: 'Session hydration timed out',
								});
							}
							resolve();
						}, HYDRATE_TIMEOUT_MS),
					),
				]);
			},
			/** Manual reload after a tenant switch / role-impacting mutation. */
			async reload(): Promise<void> {
				await loadOnce();
			},
			clear(): void {
				patchState(store, initialState);
			},
			_startPolling(): void {
				if (pollHandle !== null) return;
				pollHandle = setInterval(() => {
					if (store.error()) return;
					void loadOnce();
				}, POLL_MS);
			},
			_stopPolling(): void {
				if (pollHandle !== null) {
					clearInterval(pollHandle);
					pollHandle = null;
				}
			},
		};
	}),
	withHooks({
		onInit(store) {
			store._startPolling();
		},
		onDestroy(store) {
			store._stopPolling();
		},
	}),
);
