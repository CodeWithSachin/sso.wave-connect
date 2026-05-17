import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { firstValueFrom } from 'rxjs';
import {
	PlatformTenantsService,
	type PlatformTenant,
} from './platform-tenants.service';

/**
 * /platform/tenants — cross-tenant list visible to platform staff.
 *
 * Read-only metadata: id, name, slug, plan, primary domain, user/app caps,
 * residency, created. No drill-down in v1 (metadata-only); destructive
 * actions live on admin-api but are deferred until we have the multi-step
 * confirmation flow.
 */
@Component({
	selector: 'app-platform-tenants',
	standalone: true,
	imports: [DatePipe, FormsModule, NgIcon],
	template: `
		<div class="space-y-6">
			<div class="flex items-center justify-between gap-4">
				<div>
					<h1 class="text-2xl font-bold text-foreground">Tenants</h1>
					<p class="mt-1 text-sm text-muted-foreground">
						All customer tenants in this platform deployment.
					</p>
				</div>
				<div class="relative">
					<ng-icon
						name="heroMagnifyingGlass"
						class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
						size="0.85rem"
					/>
					<input
						type="search"
						[(ngModel)]="query"
						name="q"
						placeholder="Filter by name, slug, domain…"
						class="h-8 w-72 rounded-md border border-border bg-card pl-8 pr-3 text-[13px] text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/35"
					/>
				</div>
			</div>

			@if (error()) {
				<div
					class="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
				>
					{{ error() }}
					<button class="ml-2 underline" (click)="load()">Retry</button>
				</div>
			}

			<div class="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
				<table class="w-full text-left text-sm">
					<thead class="border-b border-border bg-muted/30">
						<tr>
							<th class="px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
								Tenant
							</th>
							<th class="px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
								Plan
							</th>
							<th class="px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
								Domain
							</th>
							<th class="px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
								Caps
							</th>
							<th class="px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
								Residency
							</th>
							<th class="px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
								Created
							</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-border">
						@if (loading()) {
							@for (i of [1,2,3,4,5]; track i) {
								<tr>
									<td class="px-4 py-3" colspan="6">
										<div class="h-4 rounded bg-muted/40 animate-pulse"></div>
									</td>
								</tr>
							}
						} @else {
							@for (t of filtered(); track t.id) {
								<tr class="hover:bg-muted/20">
									<td class="px-4 py-3">
										<div class="text-foreground">{{ t.displayName ?? t.name }}</div>
										<div class="mt-0.5 font-mono text-xs text-muted-foreground">
											{{ t.slug }}
										</div>
									</td>
									<td class="px-4 py-3">
										<span class="inline-flex items-center rounded-md bg-muted/40 px-2 py-0.5 text-xs font-medium text-foreground">
											{{ t.plan }}
										</span>
									</td>
									<td class="px-4 py-3 text-foreground">{{ t.domain ?? '—' }}</td>
									<td class="px-4 py-3 text-muted-foreground">
										{{ t.maxUsers ?? '∞' }} users / {{ t.maxApps ?? '∞' }} apps
									</td>
									<td class="px-4 py-3 text-muted-foreground">{{ t.dataResidency ?? '—' }}</td>
									<td class="px-4 py-3 text-muted-foreground">{{ t.createdAt | date:'mediumDate' }}</td>
								</tr>
							} @empty {
								<tr>
									<td colspan="6" class="px-4 py-12 text-center text-sm text-muted-foreground">
										No tenants match the current filter.
									</td>
								</tr>
							}
						}
					</tbody>
				</table>
			</div>

			@if (!loading() && total() > 0) {
				<p class="text-xs text-muted-foreground">
					Showing {{ filtered().length }} of {{ total() }} tenants.
				</p>
			}
		</div>
	`,
})
export class PlatformTenantsComponent {
	private readonly svc = inject(PlatformTenantsService);

	readonly tenants = signal<PlatformTenant[]>([]);
	readonly total = signal(0);
	readonly loading = signal(true);
	readonly error = signal<string | null>(null);
	readonly query = signal('');

	readonly filtered = computed(() => {
		const q = this.query().toLowerCase().trim();
		const all = this.tenants();
		if (!q) return all;
		return all.filter((t) =>
			t.name.toLowerCase().includes(q) ||
			t.slug.toLowerCase().includes(q) ||
			(t.displayName ?? '').toLowerCase().includes(q) ||
			(t.domain ?? '').toLowerCase().includes(q),
		);
	});

	constructor() {
		void this.load();
	}

	async load(): Promise<void> {
		this.loading.set(true);
		this.error.set(null);
		try {
			const res = await firstValueFrom(this.svc.list(1, 200));
			this.tenants.set(res?.data ?? []);
			this.total.set(res?.total ?? 0);
		} catch (err) {
			this.error.set(parseErr(err));
		} finally {
			this.loading.set(false);
		}
	}
}

function parseErr(err: unknown): string {
	if (typeof err === 'object' && err !== null) {
		const e = err as { error?: { message?: string }; message?: string; status?: number };
		if (e.status === 403) return 'You need platform-admin access to view this page.';
		return e.error?.message ?? e.message ?? 'Request failed';
	}
	return 'Request failed';
}
