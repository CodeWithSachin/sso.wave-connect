import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { MessageService } from 'primeng/api';
import { firstValueFrom } from 'rxjs';
import { MembersService, type User } from './members.service';

/**
 * /members/:id — profile, audit tail, MFA tab.
 *
 * Read-mostly; the editable surface is the display-name + status row. Other
 * fields (email, locale, timezone, last login) are server-managed. The
 * status select hits PATCH /api/v1/users/:id with the optimistic `version`
 * token the admin-api requires for concurrency.
 *
 * The MFA tab is a placeholder list — the backend endpoint
 * `GET /api/v1/users/:id/mfa-enrollments` isn't shipped yet (tracked in
 * Plan v2 §1.2). When it lands, swap the empty-state for the live list.
 */
@Component({
	selector: 'app-member-detail',
	standalone: true,
	imports: [DatePipe, FormsModule, NgIcon, RouterLink],
	template: `
		<div class="space-y-6">
			<div class="flex items-center gap-3">
				<a routerLink="/members" class="text-sm text-muted-foreground hover:text-foreground">
					← Members
				</a>
			</div>

			@if (error()) {
				<div class="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
					{{ error() }}
				</div>
			}

			@if (loading()) {
				<div class="space-y-4">
					<div class="h-8 w-1/3 rounded bg-muted/40 animate-pulse"></div>
					<div class="h-32 rounded-xl bg-muted/30 animate-pulse"></div>
				</div>
			} @else if (member(); as m) {
				<!-- Profile card -->
				<div class="rounded-xl border border-border bg-card p-6 shadow-sm">
					<div class="flex items-start justify-between gap-4">
						<div class="flex items-center gap-4">
							<div class="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
								{{ initials(m) }}
							</div>
							<div>
								<h1 class="text-xl font-bold text-foreground">{{ m.displayName ?? m.email }}</h1>
								<p class="mt-0.5 text-sm text-muted-foreground">{{ m.email }}</p>
								<div class="mt-2 flex items-center gap-2 text-xs">
									<span class="inline-flex items-center rounded-md px-2 py-0.5 font-medium"
										[class]="m.emailVerified ? 'bg-(--wc-success)/10 text-(--wc-success)' : 'bg-(--wc-warning)/10 text-(--wc-warning)'"
									>
										{{ m.emailVerified ? 'Email verified' : 'Email unverified' }}
									</span>
									<span class="inline-flex items-center rounded-md bg-muted/40 px-2 py-0.5 font-medium text-muted-foreground">
										{{ m.status }}
									</span>
								</div>
							</div>
						</div>
					</div>

					<div class="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
						<div>
							<p class="text-xs uppercase tracking-wider text-muted-foreground">Display name</p>
							<form (submit)="$event.preventDefault(); saveDisplayName()" class="mt-1 flex items-center gap-2">
								<input
									type="text"
									[(ngModel)]="displayNameEdit"
									name="displayName"
									class="flex-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
								/>
								<button
									type="submit"
									[disabled]="saving() || displayNameEdit() === (m.displayName ?? '')"
									class="rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
								>
									{{ saving() ? 'Saving…' : 'Save' }}
								</button>
							</form>
						</div>
						<div>
							<p class="text-xs uppercase tracking-wider text-muted-foreground">Last login</p>
							<p class="mt-1 text-sm text-foreground">
								{{ m.lastLoginAt ? (m.lastLoginAt | date:'medium') : 'Never' }}
							</p>
						</div>
						<div>
							<p class="text-xs uppercase tracking-wider text-muted-foreground">Joined</p>
							<p class="mt-1 text-sm text-foreground">{{ m.createdAt | date:'medium' }}</p>
						</div>
					</div>
				</div>

				<!-- Tabs -->
				<div class="rounded-xl border border-border bg-card shadow-sm">
					<div class="border-b border-border px-4 pt-2" role="tablist">
						@for (t of tabs; track t.value) {
							<button
								type="button"
								role="tab"
								(click)="activeTab.set(t.value)"
								[attr.aria-selected]="activeTab() === t.value"
								class="-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors"
								[class.border-primary]="activeTab() === t.value"
								[class.text-foreground]="activeTab() === t.value"
								[class.border-transparent]="activeTab() !== t.value"
								[class.text-muted-foreground]="activeTab() !== t.value"
							>
								{{ t.label }}
							</button>
						}
					</div>

					<div class="p-6">
						@switch (activeTab()) {
							@case ('mfa') {
								<!-- Placeholder until /users/:id/mfa-enrollments lands -->
								<div class="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
									<ng-icon name="heroLockClosed" size="1.25rem" class="mx-auto block" />
									<p class="mt-2">MFA enrollment listing ships with the next backend release.</p>
								</div>
							}
							@case ('audit') {
								<div class="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
									Per-user audit feed is available via /audit (filter by actor_id={{ m.id }}).
								</div>
							}
							@default {
								<dl class="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
									<div>
										<dt class="text-xs uppercase tracking-wider text-muted-foreground">User ID</dt>
										<dd class="mt-1 font-mono text-xs text-foreground select-all">{{ m.id }}</dd>
									</div>
									<div>
										<dt class="text-xs uppercase tracking-wider text-muted-foreground">Locale</dt>
										<dd class="mt-1 text-foreground">{{ m.locale ?? '—' }}</dd>
									</div>
									<div>
										<dt class="text-xs uppercase tracking-wider text-muted-foreground">Timezone</dt>
										<dd class="mt-1 text-foreground">{{ m.timezone ?? '—' }}</dd>
									</div>
									<div>
										<dt class="text-xs uppercase tracking-wider text-muted-foreground">Updated</dt>
										<dd class="mt-1 text-foreground">{{ m.updatedAt | date:'medium' }}</dd>
									</div>
								</dl>
							}
						}
					</div>
				</div>
			}
		</div>
	`,
})
export class MemberDetailComponent {
	private readonly route = inject(ActivatedRoute);
	private readonly svc = inject(MembersService);
	private readonly msg = inject(MessageService);

	readonly member = signal<User | null>(null);
	readonly loading = signal(true);
	readonly error = signal<string | null>(null);
	readonly saving = signal(false);
	readonly displayNameEdit = signal('');
	readonly activeTab = signal<'overview' | 'audit' | 'mfa'>('overview');

	readonly tabs = [
		{ value: 'overview' as const, label: 'Overview' },
		{ value: 'audit' as const, label: 'Audit' },
		{ value: 'mfa' as const, label: 'MFA' },
	];

	// Plain method — used by the template as `initials(m)`. Initial draft
	// wrapped this in computed() but that returns the unwrapped function on
	// access, which conflicts with template invocation syntax.
	initials(m: User): string {
		const src = m.displayName || m.email || '?';
		return src
			.split(/[\s@.]+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((p) => p[0]?.toUpperCase() ?? '')
			.join('');
	}

	constructor() {
		void this.load();
	}

	private async load(): Promise<void> {
		const id = this.route.snapshot.paramMap.get('id');
		if (!id) {
			this.error.set('Missing member id');
			this.loading.set(false);
			return;
		}
		try {
			const m = await firstValueFrom(this.svc.get(id));
			this.member.set(m);
			this.displayNameEdit.set(m.displayName ?? '');
		} catch (err) {
			this.error.set(parseErr(err));
		} finally {
			this.loading.set(false);
		}
	}

	async saveDisplayName(): Promise<void> {
		const m = this.member();
		if (!m) return;
		this.saving.set(true);
		try {
			const updated = await firstValueFrom(
				this.svc.update(m.id, {
					displayName: this.displayNameEdit().trim() || undefined,
					version: m.version,
				}),
			);
			this.member.set(updated);
			this.displayNameEdit.set(updated.displayName ?? '');
			this.msg.add({ severity: 'success', summary: 'Saved', detail: 'Display name updated.' });
		} catch (err) {
			this.msg.add({ severity: 'error', summary: 'Save failed', detail: parseErr(err) });
		} finally {
			this.saving.set(false);
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
