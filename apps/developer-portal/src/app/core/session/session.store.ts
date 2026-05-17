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
import { environment } from '../../environments/environment';
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

/**
 * Fallback poll interval. Phase 3 pushes invalidations over SSE on
 * /api/v1/session/events; the poll only fires when the SSE channel is
 * unavailable (degraded NATS or proxy). 5 min keeps freshness bounded
 * while cutting per-tab request volume from ~12/min to 0.2/min.
 */
const POLL_MS = 5 * 60 * 1000;
/** Bootstrap deadline; layout falls through with `capabilities=[]` after this. */
const HYDRATE_TIMEOUT_MS = 3_000;
const SSE_RECONNECT_MIN_MS = 1_000;
const SSE_RECONNECT_MAX_MS = 60_000;

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
		let sseSource: EventSource | null = null;
		let sseReconnectHandle: ReturnType<typeof setTimeout> | null = null;
		let sseBackoffMs = SSE_RECONNECT_MIN_MS;

		// Mirrors admin-console's closure-based SSE opener so onerror can
		// recursively reconnect after backoff without `this` binding tricks.
		function connectSSE(): void {
			if (typeof EventSource === 'undefined') return;
			if (sseSource) return;
			const url = `${environment.devPortalApiUrl}/api/v1/session/events`;
			try {
				sseSource = new EventSource(url, { withCredentials: true });
			} catch {
				return;
			}
			sseSource.addEventListener('invalidate', () => {
				sseBackoffMs = SSE_RECONNECT_MIN_MS;
				void loadOnce();
			});
			sseSource.addEventListener('ping', () => {
				sseBackoffMs = SSE_RECONNECT_MIN_MS;
			});
			sseSource.onerror = () => {
				sseSource?.close();
				sseSource = null;
				if (sseReconnectHandle !== null) return;
				const delay = sseBackoffMs;
				sseBackoffMs = Math.min(sseBackoffMs * 2, SSE_RECONNECT_MAX_MS);
				sseReconnectHandle = setTimeout(() => {
					sseReconnectHandle = null;
					connectSSE();
				}, delay);
			};
		}

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
			/** Phase 3 SSE push consumer; see admin-console for the rationale. */
			_connectSSE(): void {
				connectSSE();
			},
			_disconnectSSE(): void {
				if (sseReconnectHandle !== null) {
					clearTimeout(sseReconnectHandle);
					sseReconnectHandle = null;
				}
				sseSource?.close();
				sseSource = null;
				sseBackoffMs = SSE_RECONNECT_MIN_MS;
			},
		};
	}),
	withHooks({
		onInit(store) {
			store._startPolling();
			store._connectSSE();
		},
		onDestroy(store) {
			store._stopPolling();
			store._disconnectSSE();
		},
	}),
);
