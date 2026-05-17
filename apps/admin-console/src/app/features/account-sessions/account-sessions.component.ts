import { DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { ConfirmationService } from 'primeng/api';
import { AccountSessionsStore } from './account-sessions.store';
import type { SessionRow } from './account-sessions.service';

/**
 * /account/sessions — self-service view of the current user's active
 * sessions. Lists every device/browser the sso_session cookie has been minted
 * for; revoke kills a session so the cookie/PASETO pair becomes invalid on
 * the next request (identity-service writes the revocation to the deny list,
 * which the cookie auth middleware checks every request).
 *
 * The "current" session (this browser) is marked by the server and its
 * revoke button is hidden — revoking your own session mid-action would just
 * log you out, which is what /logout already does.
 */
@Component({
	selector: 'app-account-sessions',
	standalone: true,
	imports: [DatePipe, NgIcon],
	providers: [AccountSessionsStore, ConfirmationService],
	template: `
		<div class="space-y-6">
			<div>
				<h1 class="text-2xl font-bold text-foreground">Active sessions</h1>
				<p class="mt-1 text-sm text-muted-foreground">
					Devices and browsers where you're currently signed in. Revoking a
					session invalidates its credentials immediately.
				</p>
			</div>

			@if (store.error()) {
				<div
					class="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
					role="alert"
				>
					{{ store.error() }}
					<button class="ml-2 underline" (click)="store.load()">Retry</button>
				</div>
			}

			<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
				@if (store.loading()) {
					@for (i of skeletons; track i) {
						<div class="rounded-xl border border-border bg-card p-4">
							<div class="h-4 w-3/4 rounded bg-muted/40"></div>
							<div class="mt-2 h-3 w-1/2 rounded bg-muted/30"></div>
							<div class="mt-4 h-3 w-1/3 rounded bg-muted/30"></div>
						</div>
					}
				} @else if (store.sessions().length === 0) {
					<div
						class="col-span-full rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground"
					>
						No active sessions found.
					</div>
				} @else {
					@for (session of store.sessions(); track session.id) {
						<article
							class="rounded-xl border border-border bg-card p-4 shadow-sm"
						>
							<div class="flex items-start justify-between gap-3">
								<div class="flex-1 min-w-0">
									<div class="flex items-center gap-2">
										<ng-icon
											name="heroComputerDesktop"
											size="1rem"
											class="text-muted-foreground"
										/>
										<p class="text-sm font-medium text-foreground truncate">
											{{ describeUserAgent(session.userAgent) }}
										</p>
										@if (session.isCurrent) {
											<span
												class="inline-flex items-center rounded-md bg-(--wc-success)/10 px-2 py-0.5 text-xs font-medium text-(--wc-success)"
											>
												This device
											</span>
										}
									</div>
									<p class="mt-1 text-xs text-muted-foreground">
										{{ session.ipAddress ?? 'unknown IP' }}
										·
										Last seen
										{{ session.lastActivityAt ? (session.lastActivityAt | date:'medium') : 'never' }}
									</p>
									<p class="mt-2 text-xs text-muted-foreground">
										Started {{ session.createdAt | date:'medium' }}
										· Expires {{ session.expiresAt | date:'medium' }}
									</p>
								</div>

								@if (!session.isCurrent) {
									<button
										type="button"
										(click)="confirmRevoke(session)"
										[disabled]="store.revokingId() === session.id"
										class="rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
									>
										{{ store.revokingId() === session.id ? 'Revoking…' : 'Revoke' }}
									</button>
								}
							</div>
						</article>
					}
				}
			</div>
		</div>
	`,
})
export class AccountSessionsComponent {
	readonly store = inject(AccountSessionsStore);
	readonly skeletons = [1, 2, 3];
	private readonly confirmSvc = inject(ConfirmationService);

	confirmRevoke(session: SessionRow): void {
		this.confirmSvc.confirm({
			message: `Revoke this session on ${this.describeUserAgent(session.userAgent)}?`,
			header: 'Revoke session',
			accept: () => this.store.revoke(session.id),
		});
	}

	// Rough user-agent classifier — full UA parsing is overkill for the
	// device label, and any string we render here is non-authoritative. The
	// id + ip + last activity below uniquely disambiguates rows.
	describeUserAgent(ua: string | null): string {
		if (!ua) return 'Unknown device';
		const lower = ua.toLowerCase();
		if (lower.includes('iphone') || lower.includes('ipad'))
			return 'iOS device';
		if (lower.includes('android')) return 'Android device';
		if (lower.includes('mac os')) {
			if (lower.includes('safari') && !lower.includes('chrome'))
				return 'Safari on macOS';
			return 'macOS browser';
		}
		if (lower.includes('windows')) return 'Windows browser';
		if (lower.includes('linux')) return 'Linux browser';
		return 'Browser';
	}
}
