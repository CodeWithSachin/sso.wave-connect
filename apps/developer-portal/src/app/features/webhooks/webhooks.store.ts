import { inject } from '@angular/core';
import {
	patchState,
	signalStore,
	withHooks,
	withMethods,
	withState,
} from '@ngrx/signals';
import { MessageService } from 'primeng/api';
import { firstValueFrom } from 'rxjs';
import {
	WebhooksService,
	type CreateWebhookPayload,
	type CreatedWebhookEndpoint,
	type WebhookEndpoint,
} from './webhooks.service';

interface WebhooksState {
	endpoints: WebhookEndpoint[];
	loading: boolean;
	error: string | null;
	createOpen: boolean;
	creating: boolean;
	// Plaintext secret returned by POST; shown once in a banner then dismissed.
	newSecret: CreatedWebhookEndpoint | null;
}

export const WebhooksStore = signalStore(
	withState<WebhooksState>({
		endpoints: [],
		loading: true,
		error: null,
		createOpen: false,
		creating: false,
		newSecret: null,
	}),
	withMethods((store) => {
		const svc = inject(WebhooksService);
		const msg = inject(MessageService);
		return {
			async load(): Promise<void> {
				patchState(store, { loading: true, error: null });
				try {
					const res = await firstValueFrom(svc.list());
					patchState(store, { endpoints: res?.data ?? [], loading: false });
				} catch (err) {
					patchState(store, { loading: false, error: parseErr(err) });
				}
			},
			openCreate(): void { patchState(store, { createOpen: true }); },
			closeCreate(): void { patchState(store, { createOpen: false }); },
			dismissSecret(): void { patchState(store, { newSecret: null }); },
			async create(payload: CreateWebhookPayload): Promise<void> {
				patchState(store, { creating: true });
				try {
					const created = await firstValueFrom(svc.create(payload));
					patchState(store, {
						creating: false,
						createOpen: false,
						newSecret: created,
					});
					msg.add({
						severity: 'success',
						summary: 'Webhook created',
						detail: 'Copy the signing secret now — it won\'t be shown again.',
					});
					// Refresh list to include the new row.
					const res = await firstValueFrom(svc.list());
					patchState(store, { endpoints: res?.data ?? [] });
				} catch (err) {
					patchState(store, { creating: false });
					msg.add({ severity: 'error', summary: 'Create failed', detail: parseErr(err) });
				}
			},
			async remove(id: string): Promise<void> {
				try {
					await firstValueFrom(svc.delete(id));
					patchState(store, {
						endpoints: store.endpoints().filter((e) => e.id !== id),
					});
					msg.add({ severity: 'success', summary: 'Removed', detail: 'Webhook deleted.' });
				} catch (err) {
					msg.add({ severity: 'error', summary: 'Delete failed', detail: parseErr(err) });
				}
			},
		};
	}),
	withHooks({
		onInit(store) {
			store.load();
		},
	}),
);

function parseErr(err: unknown): string {
	if (typeof err === 'object' && err !== null) {
		const e = err as { error?: { message?: string }; message?: string };
		return e.error?.message ?? e.message ?? 'Request failed';
	}
	return 'Request failed';
}
