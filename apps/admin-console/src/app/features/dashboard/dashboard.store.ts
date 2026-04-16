import { computed, inject } from '@angular/core';
import { signalStore, withState, withComputed, withMethods, withHooks, patchState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import { DashboardService, AuditEvent } from './dashboard.service';

interface DashboardState {
  totalUsers: number;
  activeSessions: number;
  totalGroups: number;
  mfaEnrolled: number;
  recentEvents: AuditEvent[];
  loading: boolean;
  error: string | null;
}

const initialState: DashboardState = {
  totalUsers: 0,
  activeSessions: 0,
  totalGroups: 0,
  mfaEnrolled: 0,
  recentEvents: [],
  loading: true,
  error: null,
};

export const DashboardStore = signalStore(
  withState(initialState),
  withComputed(({ totalUsers, activeSessions }) => ({
    sessionRate: computed(() => {
      const users = totalUsers();
      return users > 0 ? Math.round((activeSessions() / users) * 100) : 0;
    }),
  })),
  withMethods((store) => {
    const svc = inject(DashboardService);
    return {
      async loadDashboard() {
        patchState(store, { loading: true, error: null });
        try {
          const [usersRes, membershipsRes] = await Promise.all([
            firstValueFrom(svc.getUsers(1)),
            firstValueFrom(svc.getMemberships(1)),
          ]);
          patchState(store, {
            totalUsers: usersRes?.total ?? 0,
            activeSessions: membershipsRes?.total ?? 0,
            loading: false,
          });
        } catch {
          patchState(store, { loading: false, error: 'Failed to load dashboard data' });
        }

        // Load audit events separately (may fail if service is not running)
        try {
          const auditRes = await firstValueFrom(svc.getRecentAuditEvents(10));
          patchState(store, { recentEvents: auditRes?.data ?? [] });
        } catch {
          // Audit service may not be running - that's ok
        }
      },
    };
  }),
  withHooks({
    onInit(store) {
      store.loadDashboard();
    },
  }),
);
