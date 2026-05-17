import { HttpClient } from '@angular/common/http';
import { Component, Input, computed, inject, signal } from '@angular/core';
import { DialogModule } from 'primeng/dialog';
import { firstValueFrom } from 'rxjs';

/**
 * One membership row as returned by identity-service GET /auth/session/memberships.
 * Mirrors model.MembershipSummaryItem (apps/identity-service/internal/model/dto.go).
 */
export interface MembershipSummary {
	tenant_id: string;
	tenant_name: string;
	role: string;
	is_active: boolean;
}

interface ListMembershipsResponse {
	memberships: MembershipSummary[];
	active_tenant_id: string;
}

/**
 * Shared tenant switcher used by admin-console and developer-portal.
 *
 * Renders as a button-styled chip (current tenant + chevron) that opens a
 * dialog listing every tenant the user belongs to. Selecting a row PATCHes
 * /auth/session/active-tenant on identity-service and reloads the page so
 * every signal store re-fetches under the new tenant context.
 *
 * Why a hard reload (vs. broadcasting a "tenant changed" event):
 *   Most stores are keyed by tenant via the sso_session cookie's active
 *   tenant claim, which only refreshes on the next request. Reload is the
 *   simplest way to guarantee no stale per-tenant cache lingers. The user
 *   sees a brief flash; the cost is acceptable for a deliberate switch.
 *
 * Identity-service URL is passed in via the `identityServiceUrl` input so
 * each app's environment.ts is the source of truth — the library has no
 * environment.ts of its own.
 */
@Component({
	selector: 'wc-tenant-switcher',
	standalone: true,
	imports: [DialogModule],
	template: `
		<button
			type="button"
			(click)="open()"
			class="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted/30 transition-colors"
			[disabled]="loading()"
		>
			<span class="inline-block size-1.5 rounded-full bg-(--wc-success)"></span>
			<span class="truncate max-w-[8rem]">{{ currentTenantLabel() }}</span>
			<svg class="size-3 text-muted-foreground" viewBox="0 0 12 12" fill="none">
				<path d="M3 4.5l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
			</svg>
		</button>

		<p-dialog
			[visible]="visible()"
			(visibleChange)="$event ? null : visible.set(false)"
			[modal]="true"
			[closable]="!switching()"
			[draggable]="false"
			[resizable]="false"
			styleClass="w-full max-w-md"
			header="Switch tenant"
		>
			@if (error()) {
				<div class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
					{{ error() }}
				</div>
			}

			@if (loading()) {
				<div class="space-y-2">
					@for (i of skeletons; track i) {
						<div class="h-12 rounded-lg bg-muted/30 animate-pulse"></div>
					}
				</div>
			} @else {
				<div class="space-y-1">
					@for (m of memberships(); track m.tenant_id) {
						<button
							type="button"
							(click)="switchTo(m)"
							[disabled]="switching() || m.tenant_id === activeTenantId()"
							class="w-full flex items-center justify-between gap-3 rounded-lg border border-transparent px-3 py-2 text-left hover:border-border hover:bg-muted/20 transition-colors disabled:opacity-60"
						>
							<div class="min-w-0 flex-1">
								<p class="text-sm font-medium text-foreground truncate">
									{{ m.tenant_name }}
								</p>
								<p class="text-xs text-muted-foreground">{{ m.role }}</p>
							</div>
							@if (m.tenant_id === activeTenantId()) {
								<span class="text-xs font-medium text-(--wc-success)">Current</span>
							}
						</button>
					} @empty {
						<p class="px-3 py-6 text-center text-sm text-muted-foreground">
							You aren't a member of any tenants.
						</p>
					}
				</div>
			}
		</p-dialog>
	`,
})
export class TenantSwitcherComponent {
	/**
	 * Base URL for identity-service. Both consoles pass their
	 * environment.identityServiceUrl. Required — no default to avoid a
	 * silent cross-origin call when the env var is missing.
	 */
	@Input({ required: true }) identityServiceUrl!: string;

	private readonly http = inject(HttpClient);

	readonly visible = signal(false);
	readonly memberships = signal<MembershipSummary[]>([]);
	readonly activeTenantId = signal<string>('');
	readonly loading = signal(false);
	readonly switching = signal(false);
	readonly error = signal<string | null>(null);
	readonly skeletons = [1, 2, 3];

	readonly currentTenantLabel = computed(() => {
		const id = this.activeTenantId();
		const found = this.memberships().find((m) => m.tenant_id === id);
		if (found) return found.tenant_name;
		return id ? 'Switch tenant' : 'Tenant';
	});

	async open(): Promise<void> {
		this.visible.set(true);
		await this.refresh();
	}

	private async refresh(): Promise<void> {
		this.loading.set(true);
		this.error.set(null);
		try {
			const res = await firstValueFrom(
				this.http.get<ListMembershipsResponse>(
					`${this.identityServiceUrl}/auth/session/memberships`,
					{ withCredentials: true },
				),
			);
			this.memberships.set(res?.memberships ?? []);
			this.activeTenantId.set(res?.active_tenant_id ?? '');
		} catch (err) {
			this.error.set(parseHttpError(err));
		} finally {
			this.loading.set(false);
		}
	}

	async switchTo(m: MembershipSummary): Promise<void> {
		if (m.tenant_id === this.activeTenantId()) return;
		this.switching.set(true);
		this.error.set(null);
		try {
			await firstValueFrom(
				this.http.patch(
					`${this.identityServiceUrl}/auth/session/active-tenant`,
					{ tenant_id: m.tenant_id },
					{ withCredentials: true },
				),
			);
			// Full reload so every signal store re-fetches under the new
			// active tenant. See class comment for rationale.
			window.location.reload();
		} catch (err) {
			this.switching.set(false);
			this.error.set(parseHttpError(err));
		}
	}
}

function parseHttpError(err: unknown): string {
	if (typeof err === 'object' && err !== null) {
		const e = err as { error?: { error?: string }; message?: string };
		if (e.error?.error) return e.error.error;
		return e.message ?? 'Request failed';
	}
	return 'Request failed';
}
