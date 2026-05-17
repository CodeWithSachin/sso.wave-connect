import { inject } from '@angular/core';
import { signalStore, withState, withMethods, withHooks, patchState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import { DashboardService } from './dashboard.service';

interface DashboardState {
  activeApiKeys: number;
  oauthAppCount: number;
  apiRequests30d: number | null;
  loading: boolean;
}

export const DashboardStore = signalStore(
  withState<DashboardState>({
    activeApiKeys: 0,
    oauthAppCount: 0,
    apiRequests30d: null,
    loading: true,
  }),
  withMethods((store) => {
    const svc = inject(DashboardService);
    return {
      async loadDashboard() {
        patchState(store, { loading: true });
        try {
          // Run in parallel. The 30-day metric goes to a different service
          // (audit-service) so a slow audit query doesn't block the cards
          // for keys/apps — settle independently with Promise.allSettled.
          const [keysRes, appsRes, requestsRes] = await Promise.allSettled([
            firstValueFrom(svc.getApiKeys()),
            firstValueFrom(svc.getOAuthApps()),
            firstValueFrom(svc.getApiRequests30d()),
          ]);
          patchState(store, {
            activeApiKeys: keysRes.status === 'fulfilled' ? keysRes.value?.total ?? 0 : 0,
            oauthAppCount: appsRes.status === 'fulfilled' ? appsRes.value?.total ?? 0 : 0,
            // null preserves the dash placeholder when audit-service is
            // unreachable, signalling "unknown" rather than "zero".
            apiRequests30d: requestsRes.status === 'fulfilled' ? requestsRes.value?.total ?? 0 : null,
            loading: false,
          });
        } catch {
          patchState(store, { loading: false });
        }
      },
    };
  }),
  withHooks({
    onInit(store) { store.loadDashboard(); },
  }),
);
