import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { ConfirmationService } from 'primeng/api';
import { Dialog } from 'primeng/dialog';
import { WebhooksStore } from './webhooks.store';

/**
 * /webhooks — developer-facing webhook endpoint management.
 *
 * Distinct from the admin-console's tenant-wide webhook configuration: this
 * view is for the integrator setting up their own delivery URLs. Backend
 * is webhook-service `/api/v1/webhooks`; tenant is derived from the cookie.
 *
 * Secret display: webhook-service returns the plaintext signing secret only
 * on creation. The banner shows it once with a copy button; once dismissed,
 * the user has to delete and recreate the endpoint to get a new one.
 */
@Component({
	selector: 'app-webhooks',
	standalone: true,
	imports: [DatePipe, FormsModule, NgIcon, RouterLink, Dialog],
	providers: [WebhooksStore, ConfirmationService],
	template: `
		<div class="space-y-6">
			<div class="flex items-center justify-between">
				<div>
					<h1 class="text-2xl font-bold text-foreground">Webhooks</h1>
					<p class="mt-1 text-sm text-muted-foreground">
						Receive event notifications at your own URLs. Signing secrets are
						HMAC-SHA-256.
					</p>
				</div>
				<button
					type="button"
					(click)="store.openCreate()"
					class="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
				>
					<ng-icon name="heroPlus" size="1rem" />
					New endpoint
				</button>
			</div>

			@if (store.error()) {
				<div class="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
					{{ store.error() }}
					<button class="ml-2 underline" (click)="store.load()">Retry</button>
				</div>
			}

			<!-- Plaintext secret banner — only shown right after creation -->
			@if (store.newSecret(); as secret) {
				<div class="rounded-lg border border-(--wc-success)/30 bg-(--wc-success)/5 p-4">
					<div class="flex items-start gap-3">
						<ng-icon name="heroKey" size="1.25rem" class="text-(--wc-success) shrink-0 mt-0.5" />
						<div class="flex-1 min-w-0">
							<p class="text-sm font-medium text-foreground">Webhook signing secret</p>
							<p class="text-xs text-muted-foreground mt-1">Copy this now — it won't be shown again.</p>
							<div class="flex items-center gap-2 mt-2">
								<code class="rounded-md bg-muted px-3 py-1.5 text-xs font-mono text-foreground break-all">{{ secret.secret }}</code>
								<button
									(click)="copy(secret.secret)"
									class="rounded-lg p-1.5 text-muted-foreground hover:bg-muted/50 transition-colors shrink-0"
									title="Copy"
								>
									<ng-icon name="heroClipboard" size="1rem" />
								</button>
							</div>
						</div>
						<button (click)="store.dismissSecret()" class="rounded-lg p-1 text-muted-foreground hover:bg-muted/50 shrink-0">
							<ng-icon name="heroXMark" size="1rem" />
						</button>
					</div>
				</div>
			}

			<!-- Endpoint list -->
			<div class="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
				<table class="w-full text-left text-sm">
					<thead class="border-b border-border bg-muted/30">
						<tr>
							<th class="px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">URL</th>
							<th class="px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Events</th>
							<th class="px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</th>
							<th class="px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Created</th>
							<th class="w-32"></th>
						</tr>
					</thead>
					<tbody class="divide-y divide-border">
						@if (store.loading()) {
							@for (i of [1,2,3]; track i) {
								<tr><td class="px-4 py-3" colspan="5"><div class="h-4 rounded bg-muted/40 animate-pulse"></div></td></tr>
							}
						} @else {
							@for (e of store.endpoints(); track e.id) {
								<tr class="hover:bg-muted/20">
									<td class="px-4 py-3 font-mono text-xs text-foreground truncate max-w-md">{{ e.url }}</td>
									<td class="px-4 py-3">
										<span class="text-xs text-muted-foreground">
											{{ (e.subscribed_events ?? []).length }} event types
										</span>
									</td>
									<td class="px-4 py-3">
										<span
											class="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium"
											[class]="e.is_active ? 'bg-(--wc-success)/10 text-(--wc-success)' : 'bg-destructive/10 text-destructive'"
										>
											{{ e.is_active ? 'Active' : 'Disabled' }}
										</span>
										@if (e.failure_count > 0) {
											<span class="ml-1 text-[10px] text-(--wc-warning)" [title]="e.failure_count + ' consecutive failures'">
												⚠ {{ e.failure_count }}
											</span>
										}
									</td>
									<td class="px-4 py-3 text-muted-foreground">{{ e.created_at | date:'mediumDate' }}</td>
									<td class="px-4 py-3">
										<div class="flex items-center justify-end gap-1">
											<a
												[routerLink]="['/webhooks', e.id]"
												class="rounded-lg p-1.5 text-muted-foreground hover:bg-muted/50 transition-colors"
												title="View deliveries"
											>
												<ng-icon name="heroEye" size="1rem" />
											</a>
											<button
												(click)="confirmDelete(e.id, e.url)"
												class="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
												title="Delete"
											>
												<ng-icon name="heroTrash" size="1rem" />
											</button>
										</div>
									</td>
								</tr>
							} @empty {
								<tr><td colspan="5" class="px-4 py-12 text-center text-sm text-muted-foreground">
									<ng-icon name="heroBellAlert" size="1.5rem" class="mx-auto block opacity-50" />
									<p class="mt-2">No webhook endpoints configured.</p>
								</td></tr>
							}
						}
					</tbody>
				</table>
			</div>

			<!-- Create dialog -->
			<p-dialog
				header="New webhook endpoint"
				[visible]="store.createOpen()"
				(visibleChange)="$event ? null : store.closeCreate()"
				[modal]="true"
				[closable]="!store.creating()"
				[draggable]="false"
				styleClass="w-full max-w-md"
			>
				<form (submit)="$event.preventDefault(); onCreate()" class="space-y-4">
					<div>
						<label class="block text-xs font-medium text-muted-foreground mb-1.5" for="wh-url">Endpoint URL</label>
						<input
							id="wh-url"
							type="url"
							required
							[(ngModel)]="urlInput"
							name="url"
							placeholder="https://your-app.example.com/hooks/wave-connect"
							class="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
						/>
					</div>
					<div>
						<label class="block text-xs font-medium text-muted-foreground mb-1.5" for="wh-desc">Description</label>
						<input
							id="wh-desc"
							type="text"
							[(ngModel)]="descInput"
							name="description"
							placeholder="Optional — what this endpoint does"
							class="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
						/>
					</div>
					<div>
						<label class="block text-xs font-medium text-muted-foreground mb-1.5">Subscribed events</label>
						<div class="grid grid-cols-2 gap-2">
							@for (ev of availableEvents; track ev) {
								<label class="flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
									<input
										type="checkbox"
										[checked]="selectedEvents().includes(ev)"
										(change)="toggleEvent(ev)"
										class="accent-primary"
									/>
									<span class="text-xs font-mono text-foreground">{{ ev }}</span>
								</label>
							}
						</div>
					</div>
					<div class="flex items-center justify-end gap-2 pt-2">
						<button
							type="button"
							(click)="store.closeCreate()"
							[disabled]="store.creating()"
							class="rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted/30 transition-colors disabled:opacity-50"
						>
							Cancel
						</button>
						<button
							type="submit"
							[disabled]="store.creating() || !urlInput() || selectedEvents().length === 0"
							class="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
						>
							{{ store.creating() ? 'Creating…' : 'Create endpoint' }}
						</button>
					</div>
				</form>
			</p-dialog>
		</div>
	`,
})
export class WebhooksComponent {
	readonly store = inject(WebhooksStore);
	private readonly confirmSvc = inject(ConfirmationService);

	readonly urlInput = signal('');
	readonly descInput = signal('');
	readonly selectedEvents = signal<string[]>([]);

	// Catalogue of subscribable events. Mirrors what webhook-service emits;
	// when new producers wire in, extend this list. Backend accepts any
	// string, so an unknown event just won't fire.
	readonly availableEvents = [
		'user.created',
		'user.deleted',
		'tenant.created',
		'tenant.updated',
		'membership.invited',
		'membership.accepted',
		'api_key.created',
		'api_key.revoked',
		'oauth_app.created',
		'mfa.enrolled',
	];

	toggleEvent(ev: string): void {
		this.selectedEvents.update((arr) =>
			arr.includes(ev) ? arr.filter((e) => e !== ev) : [...arr, ev],
		);
	}

	async onCreate(): Promise<void> {
		const url = this.urlInput().trim();
		if (!url || this.selectedEvents().length === 0) return;
		await this.store.create({
			url,
			description: this.descInput().trim() || undefined,
			subscribedEvents: this.selectedEvents(),
		});
		this.urlInput.set('');
		this.descInput.set('');
		this.selectedEvents.set([]);
	}

	confirmDelete(id: string, url: string): void {
		this.confirmSvc.confirm({
			message: `Delete webhook ${url.slice(0, 40)}…? In-flight deliveries will still attempt to retry.`,
			header: 'Delete webhook',
			accept: () => this.store.remove(id),
		});
	}

	copy(text: string): void {
		navigator.clipboard?.writeText(text);
	}
}
