import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { firstValueFrom } from 'rxjs';
import { ApiKeysService, type ApiKey, type UsageMetric } from './api-keys.service';

/**
 * /api-keys/:id — detail view + usage strip.
 *
 * The "chart" is an SVG sparkline drawn from the daily usage series the
 * api-keys service already exposes. Keeping it inline avoids pulling
 * chart.js into this lazy chunk for a 200-point series.
 */
@Component({
	selector: 'app-api-key-detail',
	standalone: true,
	imports: [DatePipe, NgIcon, RouterLink],
	template: `
		<div class="space-y-6">
			<a routerLink="/api-keys" class="text-sm text-muted-foreground hover:text-foreground">← API keys</a>

			@if (error()) {
				<div class="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{{ error() }}</div>
			}

			@if (loading()) {
				<div class="h-32 rounded-xl bg-muted/30 animate-pulse"></div>
			} @else if (key(); as k) {
				<div class="rounded-xl border border-border bg-card p-6 shadow-sm">
					<div class="flex items-start justify-between gap-4">
						<div>
							<h1 class="text-xl font-bold text-foreground">{{ k.name }}</h1>
							<div class="mt-1 flex items-center gap-2 text-xs">
								<code class="rounded-md bg-muted/40 px-2 py-0.5 font-mono text-muted-foreground">{{ k.keyPrefix }}…</code>
								<span class="inline-flex items-center rounded-md px-2 py-0.5 font-medium"
									[class]="k.status === 'active' ? 'bg-(--wc-success)/10 text-(--wc-success)' : 'bg-destructive/10 text-destructive'"
								>
									{{ k.status }}
								</span>
							</div>
						</div>
					</div>
					<div class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3 text-sm">
						<div>
							<p class="text-xs uppercase tracking-wider text-muted-foreground">Scopes</p>
							<p class="mt-1 font-mono text-xs text-foreground">{{ (k.scopes ?? []).join(', ') || '—' }}</p>
						</div>
						<div>
							<p class="text-xs uppercase tracking-wider text-muted-foreground">Rate limit</p>
							<p class="mt-1 text-foreground">{{ k.rateLimitPerMin ? k.rateLimitPerMin + ' req/min' : 'Unlimited' }}</p>
						</div>
						<div>
							<p class="text-xs uppercase tracking-wider text-muted-foreground">Last used</p>
							<p class="mt-1 text-foreground">{{ k.lastUsedAt ? (k.lastUsedAt | date:'medium') : 'Never' }}</p>
						</div>
					</div>
				</div>

				<!-- Usage sparkline -->
				<div class="rounded-xl border border-border bg-card p-6 shadow-sm">
					<div class="flex items-center justify-between">
						<h2 class="text-sm font-semibold text-foreground">Usage (last 30 days)</h2>
						<span class="text-xs text-muted-foreground">Total: {{ totalRequests() }} requests</span>
					</div>
					@if (usage().length === 0) {
						<p class="mt-4 rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
							No usage recorded yet.
						</p>
					} @else {
						<svg
							class="mt-4 w-full text-primary"
							viewBox="0 0 600 80"
							preserveAspectRatio="none"
							role="img"
							[attr.aria-label]="'Usage sparkline: ' + totalRequests() + ' total requests'"
						>
							<polyline
								fill="none"
								stroke="currentColor"
								stroke-width="1.5"
								[attr.points]="polylinePoints()"
							/>
						</svg>
						<div class="mt-2 flex justify-between text-[10px] font-mono text-muted-foreground">
							<span>{{ usage()[0]?.date }}</span>
							<span>{{ usage()[usage().length - 1]?.date }}</span>
						</div>
					}
				</div>
			}
		</div>
	`,
})
export class ApiKeyDetailComponent {
	private readonly route = inject(ActivatedRoute);
	private readonly svc = inject(ApiKeysService);

	readonly key = signal<ApiKey | null>(null);
	readonly usage = signal<UsageMetric[]>([]);
	readonly loading = signal(true);
	readonly error = signal<string | null>(null);

	readonly totalRequests = computed(() =>
		this.usage().reduce((sum, m) => sum + (m.requestCount ?? 0), 0),
	);

	readonly polylinePoints = computed(() => {
		const series = this.usage();
		if (series.length === 0) return '';
		const max = Math.max(1, ...series.map((s) => s.requestCount ?? 0));
		const step = 600 / Math.max(1, series.length - 1);
		return series
			.map((s, i) => `${(i * step).toFixed(1)},${(80 - ((s.requestCount ?? 0) / max) * 70 - 5).toFixed(1)}`)
			.join(' ');
	});

	constructor() {
		void this.load();
	}

	private async load(): Promise<void> {
		const id = this.route.snapshot.paramMap.get('id');
		if (!id) {
			this.error.set('Missing key id');
			this.loading.set(false);
			return;
		}
		try {
			const [keyRes, usageRes] = await Promise.all([
				firstValueFrom(this.svc.get(id)),
				firstValueFrom(this.svc.getUsage(id)),
			]);
			this.key.set(keyRes);
			this.usage.set(usageRes?.data ?? []);
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
