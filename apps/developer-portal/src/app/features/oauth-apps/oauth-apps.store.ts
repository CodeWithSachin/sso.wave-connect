import { inject } from '@angular/core';
import { signalStore, withState, withMethods, withHooks, patchState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import { MessageService } from 'primeng/api';
import { OAuthAppsService, OAuthApp } from './oauth-apps.service';

interface OAuthAppsState {
  apps: OAuthApp[];
  total: number;
  loading: boolean;
  dialogVisible: boolean;
  newCredentials: { clientId: string; clientSecret: string } | null;
}

export const OAuthAppsStore = signalStore(
  withState<OAuthAppsState>({
    apps: [],
    total: 0,
    loading: true,
    dialogVisible: false,
    newCredentials: null,
  }),
  withMethods((store) => {
    const svc = inject(OAuthAppsService);
    const msg = inject(MessageService);
    return {
      async loadApps() {
        patchState(store, { loading: true });
        try {
          const res = await firstValueFrom(svc.list());
          patchState(store, { apps: res.data ?? [], total: res.total ?? 0, loading: false });
        } catch {
          patchState(store, { loading: false });
          msg.add({ severity: 'error', summary: 'Error', detail: 'Failed to load OAuth apps' });
        }
      },
      async createApp(dto: { name: string; redirect_uris: string[]; allowed_scopes?: string[] }) {
        try {
          const res = await firstValueFrom(svc.create(dto));
          patchState(store, {
            dialogVisible: false,
            newCredentials: { clientId: res.client_id, clientSecret: res.client_secret },
          });
          msg.add({ severity: 'success', summary: 'Success', detail: 'OAuth app registered' });
          const list = await firstValueFrom(svc.list());
          patchState(store, { apps: list.data ?? [], total: list.total ?? 0 });
        } catch {
          msg.add({ severity: 'error', summary: 'Error', detail: 'Failed to register app' });
        }
      },
      async rotateSecret(id: string) {
        try {
          const res = await firstValueFrom(svc.rotateSecret(id));
          patchState(store, { newCredentials: { clientId: '', clientSecret: res.client_secret } });
          msg.add({ severity: 'success', summary: 'Success', detail: 'Client secret rotated' });
        } catch {
          msg.add({ severity: 'error', summary: 'Error', detail: 'Failed to rotate secret' });
        }
      },
      async deleteApp(id: string) {
        try {
          await firstValueFrom(svc.delete(id));
          msg.add({ severity: 'success', summary: 'Success', detail: 'OAuth app deleted' });
          const list = await firstValueFrom(svc.list());
          patchState(store, { apps: list.data ?? [], total: list.total ?? 0 });
        } catch {
          msg.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete app' });
        }
      },
      showDialog() { patchState(store, { dialogVisible: true }); },
      hideDialog() { patchState(store, { dialogVisible: false }); },
      dismissCredentials() { patchState(store, { newCredentials: null }); },
    };
  }),
  withHooks({
    onInit(store) { store.loadApps(); },
  }),
);
