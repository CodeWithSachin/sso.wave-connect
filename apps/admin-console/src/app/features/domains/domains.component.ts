import { DatePipe } from '@angular/common';
import { Component, computed, inject, resource } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Dialog } from 'primeng/dialog';
import { firstValueFrom } from 'rxjs';
import { SessionStore } from '../../core/session/session.store';
import { TxtRecordCardComponent } from './components/txt-record-card';
import {
	DomainsService,
	type TenantDomain,
} from './domains.service';
import { DomainsStore } from './domains.store';

/**
 * /domains — claim, verify, delete tenant domains.
 *
 * Backend lives on identity-service (port 3000); see DomainsService for the
 * URL shape and the auth model. Backend enforces owner/admin via membership
 * lookup; this UI mirrors with `manage_domains` capability.
 */
@Component({
	selector: 'app-domains',
	standalone: true,
	imports: [
		DatePipe,
		FormsModule,
		NgIcon,
		Dialog,
		TxtRecordCardComponent,
	],
	providers: [DomainsStore, ConfirmationService, MessageService],
	template: `
		<div class="space-y-6">
			<!-- Page header -->
			<div class="flex items-center justify-between">
				<div>
					<h1 class="text-2xl font-bold text-foreground">Domains</h1>
					<p class="mt-1 text-sm text-muted-foreground">
						Verified domains drive email-first SSO discovery and let you claim
						users with addresses on those domains.
					</p>
				</div>
				@if (store.canMutate()) {
					<button
						(click)="store.openDialog()"
						[disabled]="!store.activeTenantId()"
						class="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-[color:var(--wc-coral-hover)] disabled:cursor-not-allowed disabled:opacity-50"
					>
						<ng-icon name="heroPlus" size="1rem" />
						Add domain
					</button>
				}
			</div>

			@if (store.error()) {
				<div
					class="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
					role="alert"
				>
					{{ store.error() }}
				</div>
			}

			<!-- Persistent banner for the most recent Add — keeps the TXT
					 instructions in view after the dialog closes. -->
			@if (store.lastCreated(); as created) {
				<div class="space-y-2">
					<wc-txt-record-card
						[domain]="created.domain"
						[value]="created.verification_token"
						host="@"
					/>
					<div class="flex items-center justify-between px-1">
						<span class="text-[11px] text-muted-foreground">
							Hit Verify on the row below once the TXT record has propagated.
						</span>
						<button
							type="button"
							class="text-[11px] text-muted-foreground underline transition-colors hover:text-foreground"
							(click)="store.dismissCreated()"
						>
							Dismiss
						</button>
					</div>
				</div>
			}

			<!-- List card -->
			<div
				class="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
			>
				<table class="w-full text-left text-sm">
					<thead class="border-b border-border bg-muted/30">
						<tr>
							<th
								class="px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground"
							>
								Domain
							</th>
							<th
								class="px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground"
							>
								Status
							</th>
							<th
								class="px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground"
							>
								Verified
							</th>
							<th
								class="px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground"
							>
								Last checked
							</th>
							<th
								class="w-40 px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground"
							></th>
						</tr>
					</thead>
					<tbody class="divide-y divide-border">
						@switch (listState()) {
							@case ('loading') {
								@for (i of [1, 2, 3]; track i) {
									<tr>
										<td colspan="5" class="px-4 py-3">
											<div
												class="h-5 animate-pulse rounded bg-muted/50"
											></div>
										</td>
									</tr>
								}
							}
							@case ('error') {
								<tr>
									<td colspan="5" class="px-4 py-6 text-center text-sm text-destructive">
										Failed to load domains.
										<button
											type="button"
											class="ml-2 underline"
											(click)="reload()"
										>
											Retry
										</button>
									</td>
								</tr>
							}
							@case ('empty') {
								<tr>
									<td
										colspan="5"
										class="px-4 py-10 text-center text-sm text-muted-foreground"
									>
										No domains claimed yet.
										@if (store.canMutate()) {
											Add one to enable email-first SSO discovery.
										}
									</td>
								</tr>
							}
							@default {
								@for (row of rows(); track row.id) {
									<tr class="transition-colors hover:bg-muted/20">
										<td class="px-4 py-3">
											<div class="flex items-center gap-2.5">
												<ng-icon
													name="heroGlobeAlt"
													size="0.95rem"
													class="text-muted-foreground"
												/>
												<span class="font-mono text-[13px] text-foreground">
													{{ row.domain }}
												</span>
												@if (row.is_primary) {
													<span
														class="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
													>
														Primary
													</span>
												}
											</div>
										</td>
										<td class="px-4 py-3">
											<span
												class="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
												[class]="badgeClass(row.status)"
											>
												<span
													class="h-1.5 w-1.5 rounded-full"
													[class]="dotClass(row.status)"
												></span>
												{{ statusLabel(row.status) }}
											</span>
										</td>
										<td class="px-4 py-3 text-xs text-muted-foreground">
											{{ row.verified_at ? (row.verified_at | date: 'mediumDate') : '—' }}
										</td>
										<td class="px-4 py-3 text-xs text-muted-foreground">
											{{ row.last_checked_at ? (row.last_checked_at | date: 'short') : 'never' }}
										</td>
										<td class="px-4 py-3 text-right">
											@if (store.canMutate()) {
												<div class="flex items-center justify-end gap-1">
													@if (row.status !== 'verified') {
														<button
															type="button"
															(click)="verify(row)"
															[disabled]="store.verifyingId() === row.id"
															class="rounded-sm px-2 py-1 text-xs text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
														>
															@if (store.verifyingId() === row.id) {
																Verifying…
															} @else {
																Verify
															}
														</button>
													}
													<button
														type="button"
														(click)="confirmDelete(row)"
														[disabled]="store.submitting()"
														class="rounded-sm px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
													>
														Delete
													</button>
												</div>
											}
										</td>
									</tr>
								}
							}
						}
					</tbody>
				</table>
			</div>
		</div>

		<!-- Add domain dialog -->
		<p-dialog
			[visible]="store.dialogOpen()"
			(visibleChange)="$event ? null : store.closeDialog()"
			[modal]="true"
			[draggable]="false"
			[closable]="!store.submitting()"
			[style]="{ width: '480px' }"
			header="Add domain"
		>
			<form class="space-y-4" (submit)="$event.preventDefault(); submit()">
				<div>
					<label class="mb-1 block text-xs font-medium text-foreground">
						Domain
					</label>
					<input
						type="text"
						required
						placeholder="acme.com"
						[ngModel]="store.formDomain()"
						(ngModelChange)="store.setDomain($event)"
						name="domain"
						autocomplete="off"
						spellcheck="false"
						autocapitalize="none"
						class="block w-full rounded-md border border-border bg-input px-3 py-2 font-mono text-[13px] text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/35"
					/>
					<p class="mt-1 text-[11px] text-muted-foreground">
						Bare hostname only — no scheme, no path. Example:
						<code class="font-mono">acme.com</code>.
					</p>
				</div>
				@if (store.error()) {
					<p class="text-sm text-destructive">{{ store.error() }}</p>
				}
				<div class="flex items-center justify-end gap-2 pt-2">
					<button
						type="button"
						(click)="store.closeDialog()"
						[disabled]="store.submitting()"
						class="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
					>
						Cancel
					</button>
					<button
						type="submit"
						[disabled]="store.submitting() || !store.formDomain().trim()"
						class="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-[color:var(--wc-coral-hover)] disabled:cursor-not-allowed disabled:opacity-50"
					>
						@if (store.submitting()) {
							Adding…
						} @else {
							Add
						}
					</button>
				</div>
			</form>
		</p-dialog>
	`,
})
export class DomainsComponent {
	readonly store = inject(DomainsStore);
	private readonly session = inject(SessionStore);
	private readonly svc = inject(DomainsService);
	private readonly confirm = inject(ConfirmationService);

	/**
	 * resource() — re-runs whenever the active tenant changes OR the store
	 * bumps mutationVersion. Returns null while there's no active tenant
	 * (e.g. during hydrate).
	 */
	readonly listResource = resource({
		params: () => ({
			tenantId: this.session.activeTenant()?.id ?? null,
			v: this.store.mutationVersion(),
		}),
		loader: async ({ params }) => {
			if (!params.tenantId) return { domains: [], role: 'member' as const };
			return firstValueFrom(this.svc.list(params.tenantId));
		},
	});

	readonly rows = computed<TenantDomain[]>(
		() => this.listResource.value()?.domains ?? [],
	);

	readonly listState = computed<'loading' | 'error' | 'empty' | 'ready'>(() => {
		if (this.listResource.isLoading()) return 'loading';
		if (this.listResource.error()) return 'error';
		return this.rows().length === 0 ? 'empty' : 'ready';
	});

	async submit(): Promise<void> {
		await this.store.submitAdd();
	}

	async verify(row: TenantDomain): Promise<void> {
		const outcome = await this.store.verify(row.id);
		// `outcome` is null if the request errored; the store already surfaced
		// the message, so we don't double-render it.
		if (outcome === 'verified') {
			// Force the list to repaint with the new status pill.
			this.reload();
		}
	}

	confirmDelete(row: TenantDomain): void {
		this.confirm.confirm({
			message:
				row.status === 'verified'
					? `Delete ${row.domain}? Email-first discovery for users on this domain will stop.`
					: `Delete the pending claim for ${row.domain}?`,
			header: 'Delete domain',
			icon: 'pi pi-exclamation-triangle',
			acceptLabel: 'Delete',
			rejectLabel: 'Cancel',
			acceptButtonStyleClass: 'p-button-danger',
			accept: () => {
				void this.store.delete(row.id);
			},
		});
	}

	reload(): void {
		this.listResource.reload();
	}

	statusLabel(status: TenantDomain['status']): string {
		switch (status) {
			case 'pending':
				return 'Pending';
			case 'verifying':
				return 'Verifying';
			case 'verified':
				return 'Verified';
			case 'failed':
				return 'Failed';
			case 'expired':
				return 'Expired';
			default:
				return status;
		}
	}

	badgeClass(status: TenantDomain['status']): string {
		switch (status) {
			case 'verified':
				return 'bg-[color:var(--wc-success)]/10 text-[color:var(--wc-success)]';
			case 'pending':
			case 'verifying':
				return 'bg-[color:var(--wc-warning)]/10 text-[color:var(--wc-warning)]';
			case 'failed':
			case 'expired':
				return 'bg-destructive/10 text-destructive';
			default:
				return 'bg-muted text-muted-foreground';
		}
	}

	dotClass(status: TenantDomain['status']): string {
		switch (status) {
			case 'verified':
				return 'bg-[color:var(--wc-success)]';
			case 'pending':
			case 'verifying':
				return 'bg-[color:var(--wc-warning)]';
			case 'failed':
			case 'expired':
				return 'bg-destructive';
			default:
				return 'bg-muted-foreground';
		}
	}
}
