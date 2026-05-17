import { computed, inject } from '@angular/core';
import { signalStore, withState, withComputed, withMethods, withHooks, patchState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import { DashboardService, AuditEvent } from './dashboard.service';
import { SessionStore } from '../../core/session/session.store';

interface DashboardState {
  totalUsers: number | null;
  activeSessions: number | null;
  totalGroups: number | null;
  mfaEnrolled: number | null;
  recentEvents: AuditEvent[];
  loading: boolean;
  error: string | null;
}

const initialState: DashboardState = {
  // null = "data not applicable / unauthorized to fetch" so the UI can
  // render "—" instead of a misleading 0. Personal-tenant owners hit this
  // path because they don't hold manage_members. A6 fix.
  totalUsers: null,
  activeSessions: null,
  totalGroups: null,
  mfaEnrolled: null,
  recentEvents: [],
  loading: true,
  error: null,
};

export const DashboardStore = signalStore(
  withState(initialState),
  withComputed(({ totalUsers, activeSessions }) => ({
    sessionRate: computed(() => {
      const users = totalUsers();
      const sessions = activeSessions();
      if (users === null || sessions === null || users <= 0) return null;
      return Math.round((sessions / users) * 100);
    }),
  })),
  withMethods((store) => {
    const svc = inject(DashboardService);
    const session = inject(SessionStore);
    return {
      async loadDashboard() {
        patchState(store, { loading: true, error: null });

        // Tenant-admin metrics only apply when the caller can actually see
        // members. Personal-tenant owners never hold manage_members, so
        // we keep the counters as `null` and the UI shows "—".
        const canSeeMembers = session.capabilities().includes('manage_members');
        if (canSeeMembers) {
          try {
            const [usersRes, membershipsRes] = await Promise.all([
              firstValueFrom(svc.getUsers(1)),
              firstValueFrom(svc.getMemberships(1)),
            ]);
            patchState(store, {
              totalUsers: usersRes?.total ?? 0,
              activeSessions: membershipsRes?.total ?? 0,
            });
          } catch {
            patchState(store, { error: 'Failed to load dashboard data' });
          }
        }
        patchState(store, { loading: false });

        // Audit events require view_audit_log — skip the call entirely
        // when the caller doesn't have it (avoids a noisy 403/400 toast).
        if (session.capabilities().includes('view_audit_log')) {
          try {
            const auditRes = await firstValueFrom(svc.getRecentAuditEvents(10));
            patchState(store, { recentEvents: auditRes?.data ?? [] });
          } catch {
            // Audit service may be down or the user lost the cap between
            // hydrate and now. Leave recentEvents empty.
          }
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
