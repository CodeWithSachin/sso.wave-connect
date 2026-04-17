import { inject } from '@angular/core';
import { signalStore, withState, withMethods, withHooks, patchState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import { DashboardService } from './dashboard.service';

interface DashboardState {
  activeApiKeys: number;
  oauthAppCount: number;
  loading: boolean;
}

export const DashboardStore = signalStore(
  withState<DashboardState>({
    activeApiKeys: 0,
    oauthAppCount: 0,
    loading: true,
  }),
  withMethods((store) => {
    const svc = inject(DashboardService);
    return {
      async loadDashboard() {
        patchState(store, { loading: true });
        try {
          const [keysRes, appsRes] = await Promise.all([
            firstValueFrom(svc.getApiKeys()),
            firstValueFrom(svc.getOAuthApps()),
          ]);
          patchState(store, {
            activeApiKeys: keysRes?.total ?? 0,
            oauthAppCount: appsRes?.total ?? 0,
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
