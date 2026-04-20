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

/**
 * Internal sentinel — `loadOnce` returns this when the caller (hydrate's
 * timeout race) signalled abort. Keeps the type explicit instead of a
 * silent never-resolves promise.
 */
const ABORTED = Symbol('hydrate-aborted');

/**
 * Shell mode. Changing this swaps the sidebar entries + hides the tenant
 * chip when in platform mode. Only super-admins can enter platform mode.
 * See docs/plans/admin-role-surfaces.md D6 (one-shell layout).
 */
export type ShellMode = 'tenant' | 'platform';

interface SessionState {
  user: SessionMeDto['user'] | null;
  session: SessionMeDto['session'] | null;
  activeTenant: SessionMeDto['activeTenant'];
  memberships: SessionMeMembership[];
  platformAdmin: SessionMePlatform | null;
  capabilities: Capability[];
  mode: ShellMode;
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
  mode: 'tenant',
  loading: false,
  hydrated: false,
  error: null,
};

/** Poll interval for cheap role-propagation staleness (plan v2 MVP: 30s). */
const POLL_MS = 30_000;

/** Bootstrap timeout; APP_INITIALIZER falls through after this, rendering a
 *  limited-capabilities shell + soft banner so a 500 on admin-api doesn't
 *  prevent login-portal-redirected users from reaching a usable page. */
const HYDRATE_TIMEOUT_MS = 3_000;

/**
 * Single source of truth for the authenticated user, memberships, platform
 * role, and computed capability list. Hydrated once at app bootstrap, polled
 * every 30s, and reloaded after mutations that affect the caller's own
 * access (e.g. their own platform-admin grant was revoked).
 *
 * Reads the `SessionMeDto` payload from admin-api's GET /api/v1/session/me —
 * see apps/admin-api/src/session/session.service.ts for the composition.
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
    /** Currently-active membership (matches session's tenant_id). */
    activeMembership: computed(
      () => state.memberships().find((m) => m.isActive) ?? null,
    ),
  })),
  withMethods((store) => {
    const svc = inject(SessionService);
    let pollHandle: ReturnType<typeof setInterval> | null = null;

    /**
     * Fetch /session/me and patch state — but bail before mutating if the
     * caller's `aborted` flag is set. The flag is the only safe way to
     * keep a slow response from clobbering a deliberate timeout-state
     * write that happened first (the original race had a TOCTOU).
     */
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
          // Keep any mode the user has set manually; default to 'tenant'
          // unless they were in 'platform' and still qualify.
          mode:
            store.mode() === 'platform' && dto.platform ? 'platform' : 'tenant',
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
       * Called from `provideAppInitializer`. Races a 3s deadline — on
       * timeout the shell renders with `capabilities=[]` and the
       * capability guard redirects any protected route to /dashboard.
       *
       * The aborted-flag pattern guarantees the in-flight HTTP can't
       * resurrect after the timeout has already written the error state.
       * If the response is just slow (not failed) it's still useful, so
       * we let it land — but only by flipping the flag back off after a
       * successful return, which is currently never (timeout is terminal).
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
      /** Manual reload after grant/revoke/tenant-switch. */
      async reload(): Promise<void> {
        await loadOnce();
      },
      /** Toggle between tenant and platform shells. Non-platform-admins
       *  cannot enter platform mode. */
      setMode(mode: ShellMode): void {
        if (mode === 'platform' && !store.platformAdmin()) return;
        patchState(store, { mode });
      },
      /** Clear in-memory state (called from logout flow). */
      clear(): void {
        patchState(store, initialState);
      },
      /**
       * Internal: 30s poll for cheap role-propagation staleness. Skips a
       * tick whenever the last hydrate landed in an error state — there's
       * no upside to hammering admin-api during an outage, and the manual
       * `reload()` call from a tenant-switch / grant action covers the
       * legitimate "I need fresh state right now" case.
       */
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
      // Kick the 30s poll once the store is live. APP_INITIALIZER still runs
      // hydrate() first so the shell has a synchronous snapshot to read.
      store._startPolling();
    },
    onDestroy(store) {
      store._stopPolling();
    },
  }),
);
