import { DatePipe } from '@angular/common';
import { Component, computed, inject, resource } from '@angular/core';
import { ConfirmationService } from 'primeng/api';
import { firstValueFrom } from 'rxjs';
import { InvitationCreateDialogComponent } from './invitation-create.dialog';
import {
	InvitationsService,
	type InvitationStatus,
	type MembershipRow,
} from './invitations.service';
import { InvitationsStore } from './invitations.store';

const TABS: { value: InvitationStatus; label: string }[] = [
	{ value: 'pending', label: 'Pending' },
	{ value: 'accepted', label: 'Accepted' },
	{ value: 'expired', label: 'Expired' },
];

/**
 * /invitations — Pending / Accepted / Expired tabs over /api/v1/memberships.
 *
 * Resend (Phase 6A backend) rotates the token + extends the expiry + re-sends
 * the email — idempotent per server. Revoke is a soft-delete on the row;
 * the invitation token becomes invalid immediately.
 */
@Component({
	selector: 'app-invitations',
	standalone: true,
	imports: [DatePipe, InvitationCreateDialogComponent],
	providers: [InvitationsStore, ConfirmationService],
	template: `
		<div class="space-y-6">
			<div class="flex items-center justify-between">
				<div>
					<h1 class="text-2xl font-bold text-foreground">Invitations</h1>
					<p class="mt-1 text-sm text-muted-foreground">
						Pending invitations are valid for 14 days. Resend to rotate the
						token; revoke to invalidate it immediately.
					</p>
				</div>
				@if (store.canMutate()) {
					<button
						type="button"
						(click)="store.openCreate()"
						class="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
					>
						Invite member
					</button>
				}
			</div>

			<app-invitation-create-dialog />


			<!-- Tab strip -->
			<div role="tablist" class="inline-flex items-center gap-0.5 rounded-md border border-border bg-muted/30 p-0.5">
				@for (tab of tabs; track tab.value) {
					<button
						type="button"
						role="tab"
						(click)="store.setTab(tab.value)"
						[attr.aria-selected]="store.activeTab() === tab.value"
						class="rounded px-3 py-1 text-xs font-medium transition-colors"
						[class.bg-card]="store.activeTab() === tab.value"
						[class.text-foreground]="store.activeTab() === tab.value"
						[class.text-muted-foreground]="store.activeTab() !== tab.value"
					>
						{{ tab.label }}
					</button>
				}
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
								Invitee
							</th>
							<th class="px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
								Role
							</th>
							<th class="px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
								@switch (store.activeTab()) {
									@case ('pending') { Expires }
									@case ('accepted') { Joined }
									@case ('expired') { Expired }
								}
							</th>
							<th class="px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
								Invited
							</th>
							<th class="w-44 px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground"></th>
						</tr>
					</thead>
					<tbody class="divide-y divide-border">
						@switch (listState()) {
							@case ('loading') {
								@for (i of [1, 2, 3]; track i) {
									<tr>
										<td colspan="5" class="px-4 py-3">
											<div class="h-5 animate-pulse rounded bg-muted/50"></div>
										</td>
									</tr>
								}
							}
							@case ('error') {
								<tr>
									<td colspan="5" class="px-4 py-6 text-center text-sm text-destructive">
										Failed to load invitations.
										<button type="button" class="ml-2 underline" (click)="reload()">
											Retry
										</button>
									</td>
								</tr>
							}
							@case ('empty') {
								<tr>
									<td colspan="5" class="px-4 py-10 text-center text-sm text-muted-foreground">
										@switch (store.activeTab()) {
											@case ('pending') { No pending invitations. Invite a member from the Members page. }
											@case ('accepted') { No accepted memberships yet. }
											@case ('expired') { No expired invitations. }
										}
									</td>
								</tr>
							}
							@default {
								@for (row of rows(); track row.id) {
									<tr class="transition-colors hover:bg-muted/20">
										<td class="px-4 py-3">
											<div class="flex items-center gap-3">
												<div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
													{{ initials(row) }}
												</div>
												<div class="min-w-0">
													<p class="truncate text-sm font-medium text-foreground">
														{{ row.user.displayName ?? row.user.email }}
													</p>
													<p class="truncate font-mono text-[11px] text-muted-foreground">
														{{ row.user.email }}
													</p>
												</div>
											</div>
										</td>
										<td class="px-4 py-3">
											<span class="inline-flex rounded-full border border-border px-2 py-0.5 text-[11px] font-medium capitalize text-foreground">
												{{ row.role }}
											</span>
										</td>
										<td class="px-4 py-3 text-xs text-muted-foreground">
											{{ dateFor(row) | date: 'mediumDate' }}
										</td>
										<td class="px-4 py-3 text-xs text-muted-foreground">
											{{ row.createdAt | date: 'mediumDate' }}
										</td>
										<td class="px-4 py-3 text-right">
											@if (store.canMutate()) {
												<div class="flex items-center justify-end gap-1">
													@if (store.activeTab() !== 'accepted') {
														<button
															type="button"
															(click)="store.resend(row.id)"
															[disabled]="store.resendingId() === row.id"
															class="rounded-sm px-2 py-1 text-xs text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
														>
															@if (store.resendingId() === row.id) {
																Sending…
															} @else if (recentlyResent(row.id)) {
																Sent ✓
															} @else {
																Resend
															}
														</button>
													}
													<button
														type="button"
														(click)="confirmRevoke(row)"
														[disabled]="store.submitting()"
														class="rounded-sm px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
													>
														Revoke
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
	`,
})
export class InvitationsComponent {
	readonly store = inject(InvitationsStore);
	private readonly svc = inject(InvitationsService);
	private readonly confirm = inject(ConfirmationService);

	readonly tabs = TABS;

	readonly listResource = resource({
		params: () => ({
			status: this.store.activeTab(),
			v: this.store.mutationVersion(),
		}),
		loader: ({ params }) =>
			firstValueFrom(this.svc.list(params.status, 1, 50)),
	});

	readonly rows = computed<MembershipRow[]>(
		() => this.listResource.value()?.data ?? [],
	);

	readonly listState = computed<'loading' | 'error' | 'empty' | 'ready'>(() => {
		if (this.listResource.isLoading()) return 'loading';
		if (this.listResource.error()) return 'error';
		return this.rows().length === 0 ? 'empty' : 'ready';
	});

	dateFor(row: MembershipRow): string | null {
		// Pending + expired → invitationExpires (when it will / did expire).
		// Accepted → joinedAt.
		return this.store.activeTab() === 'accepted'
			? row.joinedAt
			: row.invitationExpires;
	}

	initials(row: MembershipRow): string {
		const source = row.user.displayName ?? row.user.email;
		const parts = source.trim().split(/[\s@]+/).filter(Boolean);
		return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase().slice(0, 2);
	}

	recentlyResent(id: string): boolean {
		const t = this.store.lastResent()[id];
		return typeof t === 'number' && Date.now() - t < 4_000;
	}

	confirmRevoke(row: MembershipRow): void {
		this.confirm.confirm({
			message: `Revoke the invitation for ${row.user.email}? The link in their email will stop working.`,
			header: 'Revoke invitation',
			icon: 'pi pi-exclamation-triangle',
			acceptLabel: 'Revoke',
			rejectLabel: 'Cancel',
			acceptButtonStyleClass: 'p-button-danger',
			accept: () => {
				void this.store.revoke(row.id);
			},
		});
	}

	reload(): void {
		this.listResource.reload();
	}
}
