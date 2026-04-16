import { inject } from '@angular/core';
import { signalStore, withState, withMethods, withHooks, patchState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import { MessageService } from 'primeng/api';
import { WebhooksService, WebhookEndpoint, CreateWebhookDto } from './webhooks.service';

interface WebhooksState {
  endpoints: WebhookEndpoint[];
  total: number;
  loading: boolean;
  dialogVisible: boolean;
  newSecret: string | null;
}

export const WebhooksStore = signalStore(
  withState<WebhooksState>({
    endpoints: [],
    total: 0,
    loading: true,
    dialogVisible: false,
    newSecret: null,
  }),
  withMethods((store) => {
    const svc = inject(WebhooksService);
    const msg = inject(MessageService);
    return {
      async loadWebhooks() {
        patchState(store, { loading: true });
        try {
          const res = await firstValueFrom(svc.list());
          patchState(store, { endpoints: res.data ?? [], total: res.total ?? 0, loading: false });
        } catch {
          patchState(store, { loading: false });
        }
      },
      async createWebhook(dto: CreateWebhookDto) {
        try {
          const res = await firstValueFrom(svc.create(dto));
          patchState(store, { dialogVisible: false, newSecret: res.secret ?? null });
          msg.add({ severity: 'success', summary: 'Success', detail: 'Webhook endpoint created' });
          const list = await firstValueFrom(svc.list());
          patchState(store, { endpoints: list.data ?? [], total: list.total ?? 0 });
        } catch {
          msg.add({ severity: 'error', summary: 'Error', detail: 'Failed to create webhook' });
        }
      },
      async toggleActive(endpoint: WebhookEndpoint) {
        try {
          await firstValueFrom(svc.update(endpoint.id, { isActive: !endpoint.isActive, version: endpoint.version }));
          msg.add({ severity: 'success', summary: 'Success', detail: `Webhook ${endpoint.isActive ? 'disabled' : 'enabled'}` });
          const list = await firstValueFrom(svc.list());
          patchState(store, { endpoints: list.data ?? [], total: list.total ?? 0 });
        } catch {
          msg.add({ severity: 'error', summary: 'Error', detail: 'Failed to update webhook' });
        }
      },
      async deleteWebhook(id: string) {
        try {
          await firstValueFrom(svc.delete(id));
          msg.add({ severity: 'success', summary: 'Success', detail: 'Webhook deleted' });
          const list = await firstValueFrom(svc.list());
          patchState(store, { endpoints: list.data ?? [], total: list.total ?? 0 });
        } catch {
          msg.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete webhook' });
        }
      },
      showDialog() { patchState(store, { dialogVisible: true }); },
      hideDialog() { patchState(store, { dialogVisible: false }); },
      dismissSecret() { patchState(store, { newSecret: null }); },
    };
  }),
  withHooks({
    onInit(store) { store.loadWebhooks(); },
  }),
);
