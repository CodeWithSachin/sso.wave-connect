import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

interface AuditEvent {
	id: string;
	action: string;
	resourceType?: string;
	resourceId?: string;
	actorId?: string;
	actorIp?: string;
	createdAt: string;
	metadataJson?: string;
}

interface AuditResponse {
	data: AuditEvent[];
	total: number;
}

/**
 * /activity — paginated audit feed scoped to the developer-portal's resource
 * types (api_key, oauth_app, scim_token, webhook). Uses the audit-service's
 * generic /api/v1/audit-logs endpoint with a comma-joined `action` filter
 * once the backend supports it; for now we fetch a broad page and let the
 * service do the filtering tenant-wide.
 */
@Component({
	selector: 'app-activity',
	standalone: true,
	imports: [DatePipe, NgIcon],
	template: `
		<div class="space-y-6">
			<div>
				<h1 class="text-2xl font-bold text-foreground">Activity</h1>
				<p class="mt-1 text-sm text-muted-foreground">
					Recent audit events for API keys, OAuth apps, SCIM tokens, and webhooks
					in your tenant.
				</p>
			</div>

			@if (error()) {
				<div class="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
					{{ error() }}
				</div>
			}

			<div class="rounded-xl border border-border bg-card shadow-sm">
				<table class="w-full text-left text-sm">
					<thead class="border-b border-border bg-muted/30">
						<tr>
							<th class="px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">When</th>
							<th class="px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Action</th>
							<th class="px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Resource</th>
							<th class="px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Actor IP</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-border">
						@if (loading()) {
							@for (i of [1,2,3,4,5]; track i) {
								<tr><td class="px-4 py-3" colspan="4"><div class="h-4 rounded bg-muted/40 animate-pulse"></div></td></tr>
							}
						} @else {
							@for (e of events(); track e.id) {
								<tr class="hover:bg-muted/20">
									<td class="px-4 py-3 text-xs text-muted-foreground">{{ e.createdAt | date:'medium' }}</td>
									<td class="px-4 py-3"><code class="rounded bg-muted/30 px-1.5 py-0.5 font-mono text-xs text-foreground">{{ e.action }}</code></td>
									<td class="px-4 py-3 text-xs text-foreground">
										@if (e.resourceType) {
											{{ e.resourceType }}<span class="text-muted-foreground"> / {{ e.resourceId?.slice(0, 8) }}…</span>
										} @else {
											—
										}
									</td>
									<td class="px-4 py-3 font-mono text-xs text-muted-foreground">{{ e.actorIp ?? '—' }}</td>
								</tr>
							} @empty {
								<tr><td colspan="4" class="px-4 py-12 text-center text-sm text-muted-foreground">
									<ng-icon name="heroDocumentText" size="1.5rem" class="mx-auto block opacity-50" />
									<p class="mt-2">No activity recorded yet.</p>
								</td></tr>
							}
						}
					</tbody>
				</table>
			</div>
		</div>
	`,
})
export class ActivityComponent {
	private readonly http = inject(HttpClient);

	readonly events = signal<AuditEvent[]>([]);
	readonly loading = signal(true);
	readonly error = signal<string | null>(null);

	constructor() {
		void this.load();
	}

	private async load(): Promise<void> {
		try {
			// audit-service enforces partition pruning — startDate/endDate
			// are mandatory. Default to "last 30 days" so the page works
			// without UI controls; date range pickers come in a follow-up.
			const endDate = new Date();
			const startDate = new Date();
			startDate.setUTCDate(startDate.getUTCDate() - 30);

			const res = await firstValueFrom(
				this.http.get<AuditResponse>(`${environment.auditServiceUrl}/api/v1/audit-logs`, {
					params: {
						page: 1,
						pageSize: 50,
						startDate: startDate.toISOString(),
						endDate: endDate.toISOString(),
					},
					withCredentials: true,
				}),
			);
			// Filter to developer-portal-relevant resource types client-side.
			// When audit-service supports `resource_type=in:(...)` we move
			// this server-side.
			const allowed = new Set(['api_key', 'oauth_app', 'scim_token', 'webhook']);
			this.events.set((res?.data ?? []).filter((e) => !e.resourceType || allowed.has(e.resourceType)));
		} catch (err) {
			this.error.set(parseErr(err));
		} finally {
			this.loading.set(false);
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
