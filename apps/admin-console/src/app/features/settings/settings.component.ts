import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { firstValueFrom } from 'rxjs';
import { SettingsService, type MyTenant } from './settings.service';

/**
 * /settings — self-service tenant editor for tenant admins.
 *
 * Editable: display name, marketing name. Read-only: slug (immutable),
 * primary domain (managed at /domains), plan + residency (platform-set).
 * Optimistic-locking via `version` is wired through the service — a
 * mid-flight PATCH from another admin returns 409 and the user sees the
 * error toast and re-fetches.
 *
 * Logo + favicon URLs accept any URL today; a real uploader belongs in
 * Plan v2 §1.5 follow-up.
 */
@Component({
	selector: 'app-settings',
	standalone: true,
	imports: [DatePipe, FormsModule, RouterLink],
	template: `
		<div class="space-y-6">
			<div>
				<h1 class="text-2xl font-bold text-foreground">Organisation settings</h1>
				<p class="mt-1 text-sm text-muted-foreground">
					Manage the basics for your tenant. Domain management lives at
					<a routerLink="/domains" class="text-primary hover:underline">/domains</a>.
				</p>
			</div>

			@if (error()) {
				<div class="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
					{{ error() }}
					<button class="ml-2 underline" (click)="load()">Retry</button>
				</div>
			}

			@if (loading()) {
				<div class="h-64 rounded-xl bg-muted/30 animate-pulse"></div>
			} @else if (tenant(); as t) {
				<form
					(submit)="$event.preventDefault(); save(t)"
					class="rounded-xl border border-border bg-card p-6 shadow-sm space-y-5"
				>
					<div class="grid grid-cols-1 gap-5 md:grid-cols-2">
						<div>
							<label class="block text-xs font-medium text-muted-foreground mb-1.5" for="tenant-name">
								Internal name
							</label>
							<input
								id="tenant-name"
								type="text"
								required
								[(ngModel)]="nameInput"
								name="name"
								class="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
							/>
						</div>
						<div>
							<label class="block text-xs font-medium text-muted-foreground mb-1.5" for="tenant-display">
								Display name
							</label>
							<input
								id="tenant-display"
								type="text"
								[(ngModel)]="displayNameInput"
								name="displayName"
								placeholder="Acme, Inc."
								class="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
							/>
						</div>
						<div>
							<label class="block text-xs font-medium text-muted-foreground mb-1.5" for="logo-url">
								Logo URL
							</label>
							<input
								id="logo-url"
								type="url"
								[(ngModel)]="logoUrlInput"
								name="logoUrl"
								placeholder="https://…"
								class="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
							/>
						</div>
						<div>
							<label class="block text-xs font-medium text-muted-foreground mb-1.5" for="favicon-url">
								Favicon URL
							</label>
							<input
								id="favicon-url"
								type="url"
								[(ngModel)]="faviconUrlInput"
								name="faviconUrl"
								placeholder="https://…"
								class="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
							/>
						</div>
					</div>

					<div class="border-t border-border pt-4">
						<h2 class="text-sm font-semibold text-foreground">Read-only</h2>
						<dl class="mt-2 grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
							<div>
								<dt class="text-xs uppercase tracking-wider text-muted-foreground">Slug</dt>
								<dd class="mt-1 font-mono text-xs text-foreground">{{ t.slug }}</dd>
							</div>
							<div>
								<dt class="text-xs uppercase tracking-wider text-muted-foreground">Primary domain</dt>
								<dd class="mt-1 text-foreground">{{ t.domain ?? '—' }}</dd>
							</div>
							<div>
								<dt class="text-xs uppercase tracking-wider text-muted-foreground">Plan</dt>
								<dd class="mt-1">
									<span class="inline-flex items-center rounded-md bg-muted/40 px-2 py-0.5 font-medium">
										{{ t.plan }}
									</span>
								</dd>
							</div>
							<div>
								<dt class="text-xs uppercase tracking-wider text-muted-foreground">Residency</dt>
								<dd class="mt-1 text-foreground">{{ t.dataResidency ?? '—' }}</dd>
							</div>
							<div>
								<dt class="text-xs uppercase tracking-wider text-muted-foreground">Created</dt>
								<dd class="mt-1 text-muted-foreground">{{ t.createdAt | date:'mediumDate' }}</dd>
							</div>
							<div>
								<dt class="text-xs uppercase tracking-wider text-muted-foreground">Last updated</dt>
								<dd class="mt-1 text-muted-foreground">{{ t.updatedAt | date:'medium' }}</dd>
							</div>
						</dl>
					</div>

					<div class="flex items-center justify-end gap-2 border-t border-border pt-4">
						<button
							type="submit"
							[disabled]="saving() || !dirty(t)"
							class="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
						>
							{{ saving() ? 'Saving…' : 'Save changes' }}
						</button>
					</div>
				</form>

				<div class="rounded-xl border border-destructive/30 bg-destructive/5 p-6">
					<h2 class="text-sm font-semibold text-destructive">Danger zone</h2>
					<p class="mt-1 text-xs text-muted-foreground">
						Account export and deletion require platform-staff involvement.
						Contact support to begin either flow.
					</p>
				</div>
			}
		</div>
	`,
})
export class SettingsComponent {
	private readonly svc = inject(SettingsService);
	private readonly msg = inject(MessageService);

	readonly tenant = signal<MyTenant | null>(null);
	readonly loading = signal(true);
	readonly saving = signal(false);
	readonly error = signal<string | null>(null);

	readonly nameInput = signal('');
	readonly displayNameInput = signal('');
	readonly logoUrlInput = signal('');
	readonly faviconUrlInput = signal('');

	constructor() {
		void this.load();
	}

	async load(): Promise<void> {
		this.loading.set(true);
		this.error.set(null);
		try {
			const t = await firstValueFrom(this.svc.get());
			this.tenant.set(t);
			this.nameInput.set(t.name);
			this.displayNameInput.set(t.displayName ?? '');
			this.logoUrlInput.set(t.logoUrl ?? '');
			this.faviconUrlInput.set(t.faviconUrl ?? '');
		} catch (err) {
			this.error.set(parseErr(err));
		} finally {
			this.loading.set(false);
		}
	}

	dirty(t: MyTenant): boolean {
		return (
			this.nameInput().trim() !== t.name ||
			(this.displayNameInput().trim() || null) !== t.displayName ||
			(this.logoUrlInput().trim() || null) !== t.logoUrl ||
			(this.faviconUrlInput().trim() || null) !== t.faviconUrl
		);
	}

	async save(t: MyTenant): Promise<void> {
		this.saving.set(true);
		try {
			const updated = await firstValueFrom(
				this.svc.update({
					name: this.nameInput().trim(),
					displayName: this.displayNameInput().trim() || null,
					logoUrl: this.logoUrlInput().trim() || null,
					faviconUrl: this.faviconUrlInput().trim() || null,
					version: t.version,
				}),
			);
			this.tenant.set(updated);
			this.msg.add({ severity: 'success', summary: 'Saved', detail: 'Tenant settings updated.' });
		} catch (err) {
			const msg = parseErr(err);
			this.msg.add({ severity: 'error', summary: 'Save failed', detail: msg });
			// On 409, reload to pick up the concurrent change.
			if ((err as { status?: number })?.status === 409) {
				await this.load();
			}
		} finally {
			this.saving.set(false);
		}
	}
}

function parseErr(err: unknown): string {
	if (typeof err === 'object' && err !== null) {
		const e = err as { error?: { message?: string }; message?: string; status?: number };
		if (e.status === 409) return 'Tenant was modified by someone else — please review and try again.';
		return e.error?.message ?? e.message ?? 'Request failed';
	}
	return 'Request failed';
}
