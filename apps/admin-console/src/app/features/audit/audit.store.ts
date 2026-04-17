import { inject } from '@angular/core';
import { signalStore, withState, withMethods, patchState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import { MessageService } from 'primeng/api';
import { AuditService, AuditEvent, AuditFilters } from './audit.service';

interface AuditState {
  events: AuditEvent[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  filters: AuditFilters;
}

export const AuditStore = signalStore(
  withState<AuditState>({
    events: [],
    total: 0,
    page: 1,
    pageSize: 20,
    loading: false,
    filters: {},
  }),
  withMethods((store) => {
    const svc = inject(AuditService);
    const msg = inject(MessageService);
    return {
      async search(filters?: AuditFilters, page?: number) {
        const f = filters ?? store.filters();
        const p = page ?? 1;
        patchState(store, { loading: true, filters: f, page: p });
        try {
          const res = await firstValueFrom(svc.list(f, p, store.pageSize()));
          patchState(store, { events: res.data ?? [], total: res.total ?? 0, loading: false });
        } catch {
          patchState(store, { loading: false });
          msg.add({ severity: 'error', summary: 'Error', detail: 'Failed to load audit logs' });
        }
      },
      async loadPage(page: number) {
        await this.search(store.filters(), page);
      },
    };
  }),
);
