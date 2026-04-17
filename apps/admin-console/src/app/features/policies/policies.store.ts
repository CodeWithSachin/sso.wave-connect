import { inject } from '@angular/core';
import { signalStore, withState, withMethods, withHooks, patchState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import { MessageService } from 'primeng/api';
import { PoliciesService, TenantPolicy } from './policies.service';

interface PoliciesState {
  policy: TenantPolicy | null;
  loading: boolean;
  saving: boolean;
}

export const PoliciesStore = signalStore(
  withState<PoliciesState>({
    policy: null,
    loading: true,
    saving: false,
  }),
  withMethods((store) => {
    const svc = inject(PoliciesService);
    const msg = inject(MessageService);
    return {
      async loadPolicy() {
        patchState(store, { loading: true });
        try {
          const policy = await firstValueFrom(svc.getPolicy());
          patchState(store, { policy, loading: false });
        } catch {
          patchState(store, { loading: false });
          msg.add({ severity: 'error', summary: 'Error', detail: 'Failed to load policies' });
        }
      },
      async savePolicy(updates: Partial<TenantPolicy>) {
        const current = store.policy();
        if (!current) return;
        patchState(store, { saving: true });
        try {
          const updated = await firstValueFrom(svc.updatePolicy({ ...updates, version: current.version }));
          patchState(store, { policy: updated, saving: false });
          msg.add({ severity: 'success', summary: 'Success', detail: 'Policies saved' });
        } catch (e: unknown) {
          patchState(store, { saving: false });
          const status = (e as { status?: number })?.status;
          if (status === 409) {
            msg.add({ severity: 'warn', summary: 'Conflict', detail: 'Policy was updated by another admin. Reloading...' });
            const policy = await firstValueFrom(svc.getPolicy());
            patchState(store, { policy });
          } else {
            msg.add({ severity: 'error', summary: 'Error', detail: 'Failed to save policies' });
          }
        }
      },
    };
  }),
  withHooks({
    onInit(store) { store.loadPolicy(); },
  }),
);
