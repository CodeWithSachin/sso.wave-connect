import { inject } from '@angular/core';
import { signalStore, withState, withMethods, withHooks, patchState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import { MessageService } from 'primeng/api';
import { ScimService, ScimToken, ScimSyncLog } from './scim.service';

interface ScimState {
  tokens: ScimToken[];
  syncLogs: ScimSyncLog[];
  loading: boolean;
  newToken: string | null;
}

export const ScimStore = signalStore(
  withState<ScimState>({
    tokens: [],
    syncLogs: [],
    loading: true,
    newToken: null,
  }),
  withMethods((store) => {
    const svc = inject(ScimService);
    const msg = inject(MessageService);
    return {
      async loadData() {
        patchState(store, { loading: true });
        try {
          const [tokensRes, logsRes] = await Promise.all([
            firstValueFrom(svc.listTokens()),
            firstValueFrom(svc.getSyncLogs()),
          ]);
          patchState(store, {
            tokens: tokensRes?.data ?? [],
            syncLogs: logsRes?.data ?? [],
            loading: false,
          });
        } catch {
          patchState(store, { loading: false });
        }
      },
      async generateToken(label?: string) {
        try {
          const res = await firstValueFrom(svc.generateToken(label));
          patchState(store, { newToken: res.token });
          msg.add({ severity: 'success', summary: 'Success', detail: 'SCIM token generated' });
          const tokensRes = await firstValueFrom(svc.listTokens());
          patchState(store, { tokens: tokensRes?.data ?? [] });
        } catch {
          msg.add({ severity: 'error', summary: 'Error', detail: 'Failed to generate token' });
        }
      },
      async revokeToken(id: string) {
        try {
          await firstValueFrom(svc.revokeToken(id));
          msg.add({ severity: 'success', summary: 'Success', detail: 'Token revoked' });
          const tokensRes = await firstValueFrom(svc.listTokens());
          patchState(store, { tokens: tokensRes?.data ?? [] });
        } catch {
          msg.add({ severity: 'error', summary: 'Error', detail: 'Failed to revoke token' });
        }
      },
      dismissToken() { patchState(store, { newToken: null }); },
    };
  }),
  withHooks({
    onInit(store) { store.loadData(); },
  }),
);
