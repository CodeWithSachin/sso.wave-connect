import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { ConfirmationService, MessageService } from 'primeng/api';
import { firstValueFrom } from 'rxjs';
import { MembersService, type User } from '../members/members.service';
import { GroupsService, type Group, type GroupMembership } from './groups.service';

/**
 * /groups/:id — group metadata header + members management table.
 *
 * Add via a free-text user-id field for v1 — a real autocomplete on the
 * users list belongs in the next iteration. The current admin-api accepts
 * `{ userId, role }` so the form maps 1:1; validation lives server-side.
 */
@Component({
	selector: 'app-group-detail',
	standalone: true,
	imports: [DatePipe, FormsModule, NgIcon, RouterLink],
	template: `
		<div class="space-y-6">
			<a routerLink="/groups" class="text-sm text-muted-foreground hover:text-foreground">← Groups</a>

			@if (error()) {
				<div class="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{{ error() }}</div>
			}

			@if (loading()) {
				<div class="h-32 rounded-xl bg-muted/30 animate-pulse"></div>
			} @else if (group(); as g) {
				<div class="rounded-xl border border-border bg-card p-6 shadow-sm">
					<h1 class="text-xl font-bold text-foreground">{{ g.name }}</h1>
					<p class="mt-1 font-mono text-xs text-muted-foreground">{{ g.slug }}</p>
					@if (g.description) {
						<p class="mt-2 text-sm text-muted-foreground">{{ g.description }}</p>
					}
					<div class="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
						<span>Created {{ g.createdAt | date:'mediumDate' }}</span>
						@if (g.isManaged) {
							<span class="inline-flex items-center rounded-md bg-(--wc-warning)/10 px-2 py-0.5 font-medium text-(--wc-warning)">
								Managed by {{ g.source ?? 'system' }}
							</span>
						}
					</div>
				</div>

				<div class="rounded-xl border border-border bg-card shadow-sm">
					<div class="flex items-center justify-between border-b border-border px-4 py-3">
						<h2 class="text-sm font-semibold text-foreground">Members</h2>
						<span class="text-xs text-muted-foreground">{{ (g.memberships ?? []).length }} total</span>
					</div>

					@if (!g.isManaged) {
						<form (submit)="$event.preventDefault(); addMember(g.id)" class="flex items-center gap-2 border-b border-border px-4 py-3">
							<input
								type="text"
								[(ngModel)]="newMemberId"
								name="userId"
								placeholder="User ID (uuid)"
								class="flex-1 rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
							/>
							<select
								[(ngModel)]="newMemberRole"
								name="role"
								class="rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground"
							>
								<option value="member">Member</option>
								<option value="admin">Admin</option>
							</select>
							<button
								type="submit"
								[disabled]="!newMemberId() || adding()"
								class="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
							>
								{{ adding() ? 'Adding…' : 'Add' }}
							</button>
						</form>
					}

					<table class="w-full text-left text-sm">
						<thead class="border-b border-border bg-muted/30">
							<tr>
								<th class="px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">User ID</th>
								<th class="px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Role</th>
								<th class="px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Joined</th>
								<th class="w-12"></th>
							</tr>
						</thead>
						<tbody class="divide-y divide-border">
							@for (m of g.memberships ?? []; track m.id) {
								<tr class="hover:bg-muted/20">
									<td class="px-4 py-2 font-mono text-xs text-foreground">{{ m.userId }}</td>
									<td class="px-4 py-2 text-foreground">{{ m.role }}</td>
									<td class="px-4 py-2 text-muted-foreground">{{ m.createdAt | date:'mediumDate' }}</td>
									<td class="px-4 py-2">
										@if (!g.isManaged) {
											<button
												(click)="confirmRemove(g.id, m)"
												class="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
												title="Remove"
											>
												<ng-icon name="heroXMark" size="0.9rem" />
											</button>
										}
									</td>
								</tr>
							} @empty {
								<tr><td colspan="4" class="px-4 py-8 text-center text-sm text-muted-foreground">No members yet</td></tr>
							}
						</tbody>
					</table>
				</div>
			}
		</div>
	`,
	providers: [ConfirmationService],
})
export class GroupDetailComponent {
	private readonly route = inject(ActivatedRoute);
	private readonly svc = inject(GroupsService);
	private readonly membersSvc = inject(MembersService);
	private readonly msg = inject(MessageService);
	private readonly confirmSvc = inject(ConfirmationService);

	readonly group = signal<Group | null>(null);
	readonly loading = signal(true);
	readonly error = signal<string | null>(null);
	readonly adding = signal(false);
	readonly newMemberId = signal('');
	readonly newMemberRole = signal('member');

	constructor() {
		void this.load();
	}

	private async load(): Promise<void> {
		const id = this.route.snapshot.paramMap.get('id');
		if (!id) {
			this.error.set('Missing group id');
			this.loading.set(false);
			return;
		}
		try {
			this.group.set(await firstValueFrom(this.svc.get(id)));
		} catch (err) {
			this.error.set(parseErr(err));
		} finally {
			this.loading.set(false);
		}
	}

	async addMember(groupId: string): Promise<void> {
		const userId = this.newMemberId().trim();
		if (!userId) return;
		this.adding.set(true);
		try {
			await firstValueFrom(this.svc.addMember(groupId, userId, this.newMemberRole()));
			this.newMemberId.set('');
			await this.load();
			this.msg.add({ severity: 'success', summary: 'Added', detail: 'Member added to group.' });
		} catch (err) {
			this.msg.add({ severity: 'error', summary: 'Add failed', detail: parseErr(err) });
		} finally {
			this.adding.set(false);
		}
	}

	confirmRemove(groupId: string, m: GroupMembership): void {
		this.confirmSvc.confirm({
			message: `Remove user ${m.userId.slice(0, 8)}… from this group?`,
			header: 'Remove member',
			accept: async () => {
				try {
					await firstValueFrom(this.svc.removeMember(groupId, m.userId));
					await this.load();
					this.msg.add({ severity: 'success', summary: 'Removed', detail: 'Member removed.' });
				} catch (err) {
					this.msg.add({ severity: 'error', summary: 'Remove failed', detail: parseErr(err) });
				}
			},
		});
	}
}

function parseErr(err: unknown): string {
	if (typeof err === 'object' && err !== null) {
		const e = err as { error?: { message?: string }; message?: string };
		return e.error?.message ?? e.message ?? 'Request failed';
	}
	return 'Request failed';
}
