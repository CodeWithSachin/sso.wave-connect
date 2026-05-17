import { DatePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { SessionStore } from '../../core/session/session.store';

/**
 * /account — read-only view of the signed-in user, fed by SessionStore
 * (which itself reads `GET /api/v1/session/me` from developer-portal-api).
 *
 * Replaces the previous implementation that synthesized fields from
 * `sessionStorage.userId/userEmail/userDisplayName` — those keys are never
 * actually set anywhere on the developer-portal, so the page always showed
 * "unknown" (D2 in the E2E review).
 */
@Component({
	selector: 'app-account',
	standalone: true,
	imports: [DatePipe, NgIcon],
	template: `
		<div class="space-y-6">
			<div>
				<h1 class="text-2xl font-bold text-foreground">Account</h1>
				<p class="mt-1 text-sm text-muted-foreground">Your developer-portal sign-in details.</p>
			</div>

			@if (loading()) {
				<div class="h-32 rounded-xl bg-muted/30 animate-pulse"></div>
			} @else if (!user()) {
				<div class="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
					Couldn't load your session. Try reloading the page; if the problem
					persists, sign out and back in.
				</div>
			} @else {
				<div class="rounded-xl border border-border bg-card p-6 shadow-sm">
					<div class="flex items-start gap-4">
						<div class="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
							<ng-icon name="heroUser" size="1.5rem" />
						</div>
						<div class="flex-1 min-w-0">
							<p class="text-sm font-medium text-foreground">{{ displayName() }}</p>
							<p class="mt-0.5 text-xs text-muted-foreground">{{ user()?.email }}</p>
							@if (!user()?.emailVerified) {
								<p class="mt-2 inline-flex items-center gap-1.5 rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
									<ng-icon name="heroExclamationTriangle" size="0.85rem" />
									Email not verified
								</p>
							}
							<dl class="mt-4 grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
								<div>
									<dt class="text-xs uppercase tracking-wider text-muted-foreground">User ID</dt>
									<dd class="mt-1 font-mono text-xs text-foreground select-all">{{ user()?.id ?? '—' }}</dd>
								</div>
								<div>
									<dt class="text-xs uppercase tracking-wider text-muted-foreground">Active tenant</dt>
									<dd class="mt-1 text-foreground">
										{{ activeTenant()?.name ?? '—' }}
										<span class="ml-1 text-xs text-muted-foreground">({{ activeTenant()?.kind ?? '—' }})</span>
									</dd>
								</div>
								<div>
									<dt class="text-xs uppercase tracking-wider text-muted-foreground">Session expires</dt>
									<dd class="mt-1 text-foreground">{{ session.session()?.expiresAt | date:'medium' }}</dd>
								</div>
								<div>
									<dt class="text-xs uppercase tracking-wider text-muted-foreground">Role</dt>
									<dd class="mt-1 text-foreground capitalize">{{ session.activeMembership()?.role ?? '—' }}</dd>
								</div>
							</dl>
						</div>
					</div>
				</div>

				<div class="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
					Need to change your email or password? Use the
					<a href="http://localhost:4300/account" target="_blank" class="text-primary hover:underline">login portal</a>
					— the developer portal is consumption-only.
				</div>
			}
		</div>
	`,
})
export class AccountComponent {
	readonly session = inject(SessionStore);

	readonly user = computed(() => this.session.user());
	readonly activeTenant = computed(() => this.session.activeTenant());
	readonly loading = computed(() => !this.session.hydrated());
	readonly displayName = computed(
		() => this.user()?.displayName ?? this.user()?.email ?? 'Unknown',
	);
}
