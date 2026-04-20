import { DatePipe } from '@angular/common';
import { Component, computed, inject, resource } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { ConfirmationService } from 'primeng/api';
import { firstValueFrom } from 'rxjs';
import { SessionStore } from '../../core/session/session.store';
import {
	MigrationsService,
	type Migration,
} from './migrations.service';
import { MigrationsStore } from './migrations.store';

/**
 * /migrations — surfaces post-claim ownership transfers (Phase 4 of the
 * dual-product onboarding plan). Tenant admins see one row per pending /
 * accepted / declined / forced migration into their org.
 *
 * Two admin actions:
 *   - Notify-force: sends the 7-day heads-up email. Available on pending /
 *     declined / expired migrations. Owner + admin.
 *   - Force-move: actually moves the membership row out of the personal
 *     tenant and into the org. **Owner-only** (`force_migration` capability).
 *     Backend additionally enforces that force-notice was sent ≥ 7d ago.
 */
@Component({
	selector: 'app-migrations',
	standalone: true,
	imports: [DatePipe, NgIcon],
	providers: [MigrationsStore, ConfirmationService],
	template: `
		<div class="space-y-6">
			<div class="flex items-center justify-between">
				<div>
					<h1 class="text-2xl font-bold text-foreground">Migrations</h1>
					<p class="mt-1 text-sm text-muted-foreground">
						Personal accounts on a verified domain are offered the chance to
						join this org. After 30 days an owner can force-move them.
					</p>
				</div>
			</div>

			@if (store.error()) {
				<div
					class="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
					role="alert"
				>
					{{ store.error() }}
					<button class="ml-2 underline" (click)="store.clearError()">Dismiss</button>
				</div>
			}

			<div class="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
				<table class="w-full text-left text-sm">
					<thead class="border-b border-border bg-muted/30">
						<tr>
							<th class="px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
								Domain
							</th>
							<th class="px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
								Status
							</th>
							<th class="px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
								Offered
							</th>
							<th class="px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
								Expires
							</th>
							<th class="px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
								Force notice
							</th>
							<th class="w-44 px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground"></th>
						</tr>
					</thead>
					<tbody class="divide-y divide-border">
						@switch (listState()) {
							@case ('loading') {
								@for (i of [1, 2, 3]; track i) {
									<tr>
										<td colspan="6" class="px-4 py-3">
											<div class="h-5 animate-pulse rounded bg-muted/50"></div>
										</td>
									</tr>
								}
							}
							@case ('error') {
								<tr>
									<td colspan="6" class="px-4 py-6 text-center text-sm text-destructive">
										Failed to load migrations.
										<button type="button" class="ml-2 underline" (click)="reload()">
											Retry
										</button>
									</td>
								</tr>
							}
							@case ('empty') {
								<tr>
									<td colspan="6" class="px-4 py-10 text-center text-sm text-muted-foreground">
										No migrations to show. Migrations are created automatically
										when a personal account on a verified domain logs in.
									</td>
								</tr>
							}
							@default {
								@for (row of rows(); track row.id) {
									<tr class="transition-colors hover:bg-muted/20">
										<td class="px-4 py-3">
											<div class="flex items-center gap-2.5">
												<ng-icon name="heroGlobeAlt" size="0.95rem" class="text-muted-foreground" />
												<span class="font-mono text-[13px] text-foreground">{{ row.domain }}</span>
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
											{{ row.offered_at | date: 'mediumDate' }}
										</td>
										<td class="px-4 py-3 text-xs text-muted-foreground">
											{{ row.expires_at | date: 'mediumDate' }}
										</td>
										<td class="px-4 py-3 text-xs text-muted-foreground">
											{{ row.force_notified_at ? (row.force_notified_at | date: 'mediumDate') : '—' }}
										</td>
										<td class="px-4 py-3 text-right">
											<div class="flex items-center justify-end gap-1">
												@if (canNotify(row)) {
													<button
														type="button"
														(click)="confirmNotify(row)"
														[disabled]="store.notifyingId() === row.id"
														class="rounded-sm px-2 py-1 text-xs text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
													>
														@if (store.notifyingId() === row.id) {
															Sending…
														} @else {
															Send reminder
														}
													</button>
												}
												@if (canForce(row)) {
													<button
														type="button"
														(click)="confirmForce(row)"
														[disabled]="store.forcingId() === row.id"
														class="rounded-sm px-2 py-1 text-xs text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
													>
														@if (store.forcingId() === row.id) {
															Forcing…
														} @else {
															Force move
														}
													</button>
												}
											</div>
										</td>
									</tr>
								}
							}
						}
					</tbody>
				</table>
			</div>
		</div>
	`,
})
export class MigrationsComponent {
	readonly store = inject(MigrationsStore);
	private readonly session = inject(SessionStore);
	private readonly svc = inject(MigrationsService);
	private readonly confirm = inject(ConfirmationService);

	readonly listResource = resource({
		params: () => ({
			tenantId: this.session.activeTenant()?.id ?? null,
			v: this.store.mutationVersion(),
		}),
		loader: ({ params }) => {
			if (!params.tenantId) return Promise.resolve({ migrations: [] });
			return firstValueFrom(this.svc.list(params.tenantId));
		},
	});

	readonly rows = computed<Migration[]>(
		() => this.listResource.value()?.migrations ?? [],
	);

	readonly listState = computed<'loading' | 'error' | 'empty' | 'ready'>(() => {
		if (this.listResource.isLoading()) return 'loading';
		if (this.listResource.error()) return 'error';
		return this.rows().length === 0 ? 'empty' : 'ready';
	});

	canNotify(row: Migration): boolean {
		// Notify-force only makes sense before the move actually happens.
		return ['pending', 'declined', 'expired'].includes(String(row.status));
	}

	canForce(row: Migration): boolean {
		// Force only after the 7-day notice; backend enforces, but UI hides the
		// button until force_notified_at is set.
		return (
			this.store.canForce() &&
			!!row.force_notified_at &&
			!['accepted', 'force_moved'].includes(String(row.status))
		);
	}

	confirmNotify(row: Migration): void {
		this.confirm.confirm({
			message: `Send the 7-day force-move heads-up email for ${row.domain}? They'll have a final week to accept before an owner can force the move.`,
			header: 'Send force-move reminder',
			icon: 'pi pi-info-circle',
			acceptLabel: 'Send',
			rejectLabel: 'Cancel',
			accept: () => {
				void this.store.notifyForce(row.id);
			},
		});
	}

	confirmForce(row: Migration): void {
		this.confirm.confirm({
			message: `Force-move the user from their personal tenant into this org? Their data follows them; their personal tenant is soft-deleted. This is irreversible.`,
			header: `Force move on ${row.domain}`,
			icon: 'pi pi-exclamation-triangle',
			acceptLabel: 'Force move',
			rejectLabel: 'Cancel',
			acceptButtonStyleClass: 'p-button-danger',
			accept: () => {
				void this.store.force(row.id);
			},
		});
	}

	statusLabel(status: string): string {
		switch (status) {
			case 'pending':
				return 'Pending';
			case 'accepted':
				return 'Accepted';
			case 'declined':
				return 'Declined';
			case 'expired':
				return 'Expired';
			case 'force_notified':
				return 'Force notified';
			case 'force_moved':
				return 'Force-moved';
			default:
				return status;
		}
	}

	badgeClass(status: string): string {
		switch (status) {
			case 'accepted':
			case 'force_moved':
				return 'bg-[color:var(--wc-success)]/10 text-[color:var(--wc-success)]';
			case 'pending':
			case 'force_notified':
				return 'bg-[color:var(--wc-warning)]/10 text-[color:var(--wc-warning)]';
			case 'declined':
			case 'expired':
				return 'bg-destructive/10 text-destructive';
			default:
				return 'bg-muted text-muted-foreground';
		}
	}

	dotClass(status: string): string {
		switch (status) {
			case 'accepted':
			case 'force_moved':
				return 'bg-[color:var(--wc-success)]';
			case 'pending':
			case 'force_notified':
				return 'bg-[color:var(--wc-warning)]';
			case 'declined':
			case 'expired':
				return 'bg-destructive';
			default:
				return 'bg-muted-foreground';
		}
	}

	reload(): void {
		this.listResource.reload();
	}
}
