import { inject } from '@angular/core';
import { signalStore, withState, withMethods, withHooks, patchState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import { MessageService } from 'primeng/api';
import { ApiKeysService, ApiKey, CreateApiKeyDto } from './api-keys.service';

interface ApiKeysState {
  keys: ApiKey[];
  total: number;
  page: number;
  loading: boolean;
  dialogVisible: boolean;
  newKey: string | null;
}

export const ApiKeysStore = signalStore(
  withState<ApiKeysState>({
    keys: [],
    total: 0,
    page: 1,
    loading: true,
    dialogVisible: false,
    newKey: null,
  }),
  withMethods((store) => {
    const svc = inject(ApiKeysService);
    const msg = inject(MessageService);
    return {
      async loadKeys(page?: number) {
        const p = page ?? store.page();
        patchState(store, { loading: true, page: p });
        try {
          const res = await firstValueFrom(svc.list(p));
          patchState(store, { keys: res.data ?? [], total: res.total ?? 0, loading: false });
        } catch {
          patchState(store, { loading: false });
          msg.add({ severity: 'error', summary: 'Error', detail: 'Failed to load API keys' });
        }
      },
      async createKey(dto: CreateApiKeyDto) {
        try {
          const res = await firstValueFrom(svc.create(dto));
          patchState(store, { newKey: res.key, dialogVisible: false });
          msg.add({ severity: 'success', summary: 'Success', detail: 'API key created' });
          const list = await firstValueFrom(svc.list(store.page()));
          patchState(store, { keys: list.data ?? [], total: list.total ?? 0 });
        } catch {
          msg.add({ severity: 'error', summary: 'Error', detail: 'Failed to create API key' });
        }
      },
      async revokeKey(id: string) {
        try {
          await firstValueFrom(svc.revoke(id));
          msg.add({ severity: 'success', summary: 'Success', detail: 'API key revoked' });
          const list = await firstValueFrom(svc.list(store.page()));
          patchState(store, { keys: list.data ?? [], total: list.total ?? 0 });
        } catch {
          msg.add({ severity: 'error', summary: 'Error', detail: 'Failed to revoke key' });
        }
      },
      showDialog() { patchState(store, { dialogVisible: true }); },
      hideDialog() { patchState(store, { dialogVisible: false }); },
      dismissKey() { patchState(store, { newKey: null }); },
    };
  }),
  withHooks({
    onInit(store) { store.loadKeys(); },
  }),
);
