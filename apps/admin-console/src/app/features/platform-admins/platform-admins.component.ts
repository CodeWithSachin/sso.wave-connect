import { DatePipe } from '@angular/common';
import { Component, computed, inject, resource } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { ConfirmationService } from 'primeng/api';
import { Dialog } from 'primeng/dialog';
import { firstValueFrom } from 'rxjs';
import type { PlatformAdminRole } from '@sso-platform/shared-types';
import { SessionStore } from '../../core/session/session.store';
import {
	PlatformAdminsService,
	type PlatformAdminRow,
} from './platform-admins.service';
import { PlatformAdminsStore } from './platform-admins.store';

/**
 * /platform/admins — list, grant, revoke platform admins.
 *
 * Architecture (plan v2 D5):
 *   - List: `resource()` driven by `store.mutationVersion()`. After a
 *     mutation succeeds the store bumps that signal and the list reloads.
 *   - Mutations: live on the PlatformAdminsStore. Component delegates.
 *
 * Visibility:
 *   - The route guard already enforces `view_platform_admins`.
 *   - The grant/revoke buttons are additionally hidden when the caller
 *     does not hold `manage_platform_admins` (i.e. support/readonly admins
 *     can see the list but cannot mutate). Backend re-enforces.
 */
@Component({
	selector: 'app-platform-admins',
	standalone: true,
	imports: [DatePipe, FormsModule, NgIcon, Dialog],
	providers: [PlatformAdminsStore, ConfirmationService],
	template: `
		<div class="space-y-6">
			<!-- Page header -->
			<div class="flex items-center justify-between">
				<div>
					<h1 class="text-2xl font-bold text-foreground">Platform admins</h1>
					<p class="mt-1 text-sm text-muted-foreground">
						Cross-tenant operators. Grant carefully — these accounts can act
						in every workspace.
					</p>
				</div>
				@if (store.canMutate()) {
					<button
						(click)="store.openDialog()"
						class="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-[color:var(--wc-coral-hover)]"
					>
						<ng-icon name="heroUserPlus" size="1rem" />
						Grant admin
					</button>
				}
			</div>

			<!-- Mutation error banner -->
			@if (store.error()) {
				<div
					class="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
					role="alert"
				>
					{{ store.error() }}
				</div>
			}

			<!-- Table card -->
			<div
				class="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
			>
				<table class="w-full text-left text-sm">
					<thead class="border-b border-border bg-muted/30">
						<tr>
							<th
								class="px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground"
							>
								Email
							</th>
							<th
								class="px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground"
							>
								Role
							</th>
							<th
								class="px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground"
							>
								Granted
							</th>
							<th
								class="px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground"
							>
								Notes
							</th>
							<th
								class="w-32 px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground"
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
										Failed to load platform admins.
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
										No platform admins yet.
										@if (store.canMutate()) {
											Grant the first one to start.
										}
									</td>
								</tr>
							}
							@default {
								@for (row of rows(); track row.userId) {
									<tr class="transition-colors hover:bg-muted/20">
										<td class="px-4 py-3">
											<div class="flex items-center gap-3">
												<div
													class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary"
												>
													{{ row.email.charAt(0).toUpperCase() }}
												</div>
												<div class="min-w-0">
													<p class="truncate text-sm font-medium text-foreground">
														{{ row.email }}
													</p>
													<p
														class="truncate font-mono text-[11px] text-muted-foreground"
													>
														{{ row.userId }}
													</p>
												</div>
											</div>
										</td>
										<td class="px-4 py-3">
											<span
												class="inline-flex rounded-full border border-border px-2 py-0.5 text-[11px] font-medium capitalize text-foreground"
											>
												{{ row.role }}
											</span>
										</td>
										<td class="px-4 py-3 text-xs text-muted-foreground">
											{{ row.grantedAt | date: 'mediumDate' }}
										</td>
										<td class="px-4 py-3 text-xs text-muted-foreground">
											{{ row.notes ?? '—' }}
										</td>
										<td class="px-4 py-3 text-right">
											@if (store.canMutate()) {
												<button
													type="button"
													(click)="confirmRevoke(row)"
													[disabled]="store.submitting()"
													class="rounded-sm px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
												>
													Revoke
												</button>
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

		<!-- Grant dialog -->
		<p-dialog
			[visible]="store.dialogOpen()"
			(visibleChange)="$event ? null : store.closeDialog()"
			[modal]="true"
			[draggable]="false"
			[closable]="!store.submitting()"
			[style]="{ width: '480px' }"
			header="Grant platform admin"
		>
			<form class="space-y-4" (submit)="$event.preventDefault(); submit()">
				<div>
					<label class="mb-1 block text-xs font-medium text-foreground"
						>User UUID</label
					>
					<input
						type="text"
						required
						placeholder="00000000-0000-0000-0000-000000000000"
						[ngModel]="store.formUserId()"
						(ngModelChange)="store.setUserId($event)"
						name="userId"
						autocomplete="off"
						class="block w-full rounded-md border border-border bg-input px-3 py-2 font-mono text-[13px] text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/35"
					/>
					<p class="mt-1 text-[11px] text-muted-foreground">
						The user must already exist. Find their UUID in the Members table
						of any tenant they belong to.
					</p>
				</div>
				<div>
					<label class="mb-1 block text-xs font-medium text-foreground"
						>Role</label
					>
					<select
						[ngModel]="store.formRole()"
						(ngModelChange)="onRoleChange($event)"
						name="role"
						class="block w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/35"
					>
						<option value="superadmin">Super admin (full power)</option>
						<option value="support">Support (cross-tenant operator)</option>
						<option value="readonly">Readonly (cross-tenant viewer)</option>
					</select>
				</div>
				<div>
					<label class="mb-1 block text-xs font-medium text-foreground"
						>Justification (optional)</label
					>
					<textarea
						[ngModel]="store.formNotes()"
						(ngModelChange)="store.setNotes($event)"
						name="notes"
						rows="2"
						maxlength="512"
						class="block w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/35"
					></textarea>
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
						[disabled]="store.submitting() || !store.formUserId().trim()"
						class="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-[color:var(--wc-coral-hover)] disabled:cursor-not-allowed disabled:opacity-50"
					>
						@if (store.submitting()) {
							Granting…
						} @else {
							Grant
						}
					</button>
				</div>
			</form>
		</p-dialog>
	`,
})
export class PlatformAdminsComponent {
	readonly store = inject(PlatformAdminsStore);
	readonly session = inject(SessionStore);
	private readonly svc = inject(PlatformAdminsService);
	private readonly confirm = inject(ConfirmationService);

	/**
	 * resource() reload key — re-runs the loader whenever the store bumps
	 * mutationVersion. Empty params object keeps the URL stable.
	 */
	readonly listResource = resource({
		params: () => ({ v: this.store.mutationVersion() }),
		loader: () => firstValueFrom(this.svc.list()),
	});

	readonly rows = computed<PlatformAdminRow[]>(
		() => this.listResource.value()?.data ?? [],
	);

	readonly listState = computed<'loading' | 'error' | 'empty' | 'ready'>(() => {
		if (this.listResource.isLoading()) return 'loading';
		if (this.listResource.error()) return 'error';
		return this.rows().length === 0 ? 'empty' : 'ready';
	});

	onRoleChange(role: string): void {
		// Narrow the string union to PlatformAdminRole.
		this.store.setRole(role as PlatformAdminRole);
	}

	async submit(): Promise<void> {
		await this.store.submitGrant();
	}

	confirmRevoke(row: PlatformAdminRow): void {
		this.confirm.confirm({
			message: `Revoke platform-admin from ${row.email}? They will lose cross-tenant access immediately.`,
			header: 'Revoke platform admin',
			icon: 'pi pi-exclamation-triangle',
			acceptLabel: 'Revoke',
			rejectLabel: 'Cancel',
			acceptButtonStyleClass: 'p-button-danger',
			accept: () => {
				void this.store.revoke(row.userId);
			},
		});
	}

	reload(): void {
		this.listResource.reload();
	}
}
