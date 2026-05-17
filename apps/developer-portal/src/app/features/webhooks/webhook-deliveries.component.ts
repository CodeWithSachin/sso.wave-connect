import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { MessageService } from 'primeng/api';
import { firstValueFrom } from 'rxjs';
import { WebhooksService, type WebhookDelivery } from './webhooks.service';

/**
 * /webhooks/:id — delivery history for a single endpoint.
 *
 * Each row is one delivery attempt (an event may have multiple attempts on
 * retry). Expand to see the request/response bodies. Replay POSTs a fresh
 * attempt; webhook-service will mark the original delivery `retrying` and
 * insert a new row when the retry completes.
 */
@Component({
	selector: 'app-webhook-deliveries',
	standalone: true,
	imports: [DatePipe, NgIcon, RouterLink],
	template: `
		<div class="space-y-6">
			<a routerLink="/webhooks" class="text-sm text-muted-foreground hover:text-foreground">← Webhooks</a>

			<div>
				<h1 class="text-2xl font-bold text-foreground">Delivery history</h1>
				<p class="mt-1 text-xs font-mono text-muted-foreground">{{ endpointId }}</p>
			</div>

			@if (error()) {
				<div class="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
					{{ error() }}
					<button class="ml-2 underline" (click)="load()">Retry</button>
				</div>
			}

			<div class="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
				<table class="w-full text-left text-sm">
					<thead class="border-b border-border bg-muted/30">
						<tr>
							<th class="px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">When</th>
							<th class="px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Event</th>
							<th class="px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</th>
							<th class="px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Attempt</th>
							<th class="w-32"></th>
						</tr>
					</thead>
					<tbody class="divide-y divide-border">
						@if (loading()) {
							@for (i of [1,2,3]; track i) {
								<tr><td class="px-4 py-3" colspan="5"><div class="h-4 rounded bg-muted/40 animate-pulse"></div></td></tr>
							}
						} @else {
							@for (d of deliveries(); track d.id) {
								<ng-container>
									<tr class="hover:bg-muted/20 cursor-pointer" (click)="toggleExpand(d.id)">
										<td class="px-4 py-3 text-xs text-muted-foreground">{{ d.createdAt | date:'medium' }}</td>
										<td class="px-4 py-3"><code class="rounded bg-muted/30 px-1.5 py-0.5 font-mono text-xs text-foreground">{{ d.eventType }}</code></td>
										<td class="px-4 py-3">
											<span class="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium"
												[class]="statusClass(d)"
											>
												{{ d.status }}{{ d.statusCode ? ' (' + d.statusCode + ')' : '' }}
											</span>
										</td>
										<td class="px-4 py-3 text-muted-foreground">#{{ d.attempt }}</td>
										<td class="px-4 py-3 text-right">
											@if (canRetry(d)) {
												<button
													(click)="$event.stopPropagation(); retry(d.id)"
													[disabled]="retryingId() === d.id"
													class="rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted/30 disabled:opacity-50"
												>
													{{ retryingId() === d.id ? 'Replaying…' : 'Replay' }}
												</button>
											}
										</td>
									</tr>
									@if (expandedId() === d.id) {
										<tr class="bg-muted/10">
											<td colspan="5" class="px-4 py-3">
												<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
													<div>
														<p class="text-xs uppercase tracking-wider text-muted-foreground">Request</p>
														<pre class="mt-1 max-h-48 overflow-auto rounded-md bg-muted/40 p-2 font-mono text-[11px] text-foreground">{{ d.requestBody ?? '(empty)' }}</pre>
													</div>
													<div>
														<p class="text-xs uppercase tracking-wider text-muted-foreground">Response</p>
														<pre class="mt-1 max-h-48 overflow-auto rounded-md bg-muted/40 p-2 font-mono text-[11px] text-foreground">{{ d.responseBody ?? d.errorMessage ?? '(no body)' }}</pre>
													</div>
												</div>
											</td>
										</tr>
									}
								</ng-container>
							} @empty {
								<tr><td colspan="5" class="px-4 py-12 text-center text-sm text-muted-foreground">
									<ng-icon name="heroPaperAirplane" size="1.5rem" class="mx-auto block opacity-50" />
									<p class="mt-2">No deliveries recorded yet.</p>
								</td></tr>
							}
						}
					</tbody>
				</table>
			</div>
		</div>
	`,
})
export class WebhookDeliveriesComponent {
	private readonly route = inject(ActivatedRoute);
	private readonly svc = inject(WebhooksService);
	private readonly msg = inject(MessageService);

	readonly endpointId: string;
	readonly deliveries = signal<WebhookDelivery[]>([]);
	readonly loading = signal(true);
	readonly error = signal<string | null>(null);
	readonly retryingId = signal<string | null>(null);
	readonly expandedId = signal<string | null>(null);

	constructor() {
		this.endpointId = this.route.snapshot.paramMap.get('id') ?? '';
		void this.load();
	}

	async load(): Promise<void> {
		if (!this.endpointId) {
			this.error.set('Missing endpoint id');
			this.loading.set(false);
			return;
		}
		this.loading.set(true);
		this.error.set(null);
		try {
			const res = await firstValueFrom(this.svc.listDeliveries(this.endpointId));
			this.deliveries.set(res?.data ?? []);
		} catch (err) {
			this.error.set(parseErr(err));
		} finally {
			this.loading.set(false);
		}
	}

	toggleExpand(id: string): void {
		this.expandedId.update((cur) => (cur === id ? null : id));
	}

	canRetry(d: WebhookDelivery): boolean {
		return d.status !== 'success' && d.status !== 'retrying';
	}

	statusClass(d: WebhookDelivery): string {
		if (d.status === 'success') return 'bg-(--wc-success)/10 text-(--wc-success)';
		if (d.status === 'retrying' || d.status === 'pending') return 'bg-(--wc-warning)/10 text-(--wc-warning)';
		return 'bg-destructive/10 text-destructive';
	}

	async retry(deliveryId: string): Promise<void> {
		this.retryingId.set(deliveryId);
		try {
			await firstValueFrom(this.svc.retryDelivery(this.endpointId, deliveryId));
			this.msg.add({ severity: 'success', summary: 'Replay queued', detail: 'A new attempt is scheduled.' });
			await this.load();
		} catch (err) {
			this.msg.add({ severity: 'error', summary: 'Replay failed', detail: parseErr(err) });
		} finally {
			this.retryingId.set(null);
		}
	}
}

function parseErr(err: unknown): string {
	if (typeof err === 'object' && err !== null) {
		const e = err as { error?: { message?: string }; message?: string };
		return e.error?.message ?? e.message ?? 'Request failed';
	}
	return 'Request failed';
}
