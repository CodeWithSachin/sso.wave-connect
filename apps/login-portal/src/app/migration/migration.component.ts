import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { AuthStore } from '../store/auth.store';

/**
 * Phase 4 post-claim migration landing page. Mounted at `/migration/:token`.
 *
 * Flow:
 *   1. On init, GET /auth/public/migration/:token to load the offer metadata.
 *      Unknown/expired/already-resolved tokens collapse into a single "not
 *      available" view — the server returns 410 for all of them to resist
 *      enumeration, and we mirror that opaqueness in the UI.
 *   2. User sees the domain and a deadline, then picks accept or decline.
 *   3. Accept POST → on 204, redirect to /login with a banner. The server
 *      revoked all of the user's sessions server-side, so the cookie they
 *      may have is already dead.
 *   4. Decline POST → on 204, show a confirmation and a link back to the
 *      personal workspace sign-in.
 */
@Component({
  standalone: true,
  selector: 'app-migration',
  imports: [RouterLink, DatePipe],
  template: `
    <div class="min-h-screen bg-background flex items-center justify-center px-4 font-sans">
      <div class="bg-card text-card-foreground rounded-lg p-8 w-full max-w-lg border border-border">
        @if (status() === 'loading') {
          <h1 class="text-xl font-semibold">Loading your invitation…</h1>
          <p class="mt-3 text-sm text-muted-foreground">One moment.</p>
        } @else if (status() === 'unavailable') {
          <h1 class="text-xl font-semibold text-destructive" data-testid="migration-unavailable">
            This link is no longer valid
          </h1>
          <p class="mt-3 text-sm text-muted-foreground">
            It may have already been used, or the invitation has expired.
            If you still have questions, check with the admin of the organization that invited you.
          </p>
          <a routerLink="/login" class="mt-6 inline-block text-primary font-medium hover:underline">
            Back to sign-in →
          </a>
        } @else if (status() === 'ready') {
          <h1 class="text-xl font-semibold" data-testid="migration-ready">
            Join the <span class="font-mono">{{ offer()?.organization }}</span> workspace?
          </h1>
          <p class="mt-3 text-sm text-muted-foreground">
            Your account's email belongs to <strong>{{ offer()?.domain }}</strong>, which now has a team workspace on WaveConnect.
          </p>
          <p class="mt-2 text-sm text-muted-foreground">
            You have until
            <strong>{{ offer()?.expires_at | date: 'mediumDate' }}</strong>
            to decide. If you choose nothing, the team's owner can move your account automatically after that date.
          </p>

          <div class="mt-6 grid gap-3">
            <button
              type="button"
              (click)="onAccept()"
              [disabled]="store.loading()"
              data-testid="migration-accept"
              class="bg-primary text-primary-foreground rounded-md px-4 py-2 w-full font-medium hover:opacity-90 disabled:opacity-50 cursor-pointer text-sm"
            >
              {{ store.loading() ? 'Working…' : 'Join ' + (offer()?.organization || 'the team') }}
            </button>
            <button
              type="button"
              (click)="onDecline()"
              [disabled]="store.loading()"
              data-testid="migration-decline"
              class="bg-secondary text-secondary-foreground rounded-md px-4 py-2 w-full font-medium hover:opacity-90 disabled:opacity-50 cursor-pointer text-sm"
            >
              Keep personal workspace
            </button>
          </div>

          <p class="mt-6 text-xs text-muted-foreground">
            Joining moves your account to the team — your sessions will end so you can sign in again under the team's branding.
          </p>

          @if (store.error()) {
            <p class="mt-4 text-sm text-destructive" role="alert">{{ store.error() }}</p>
          }
        } @else if (status() === 'accepted') {
          <h1 class="text-xl font-semibold" data-testid="migration-accepted">
            You're in. Sign back in to {{ offer()?.organization }}.
          </h1>
          <p class="mt-3 text-sm text-muted-foreground">
            Your account now belongs to the team workspace. Sign in again to continue under the team's branding.
          </p>
          <a routerLink="/login" class="mt-6 inline-block text-primary font-medium hover:underline">
            Go to sign-in →
          </a>
        } @else if (status() === 'declined') {
          <h1 class="text-xl font-semibold" data-testid="migration-declined">
            Got it — you're staying on your personal workspace.
          </h1>
          <p class="mt-3 text-sm text-muted-foreground">
            If the team enables single sign-on for {{ offer()?.domain }}, password access for this email may be disabled later. The team's owner may also move your account after the grace period.
          </p>
          <a routerLink="/login" class="mt-6 inline-block text-primary font-medium hover:underline">
            Back to sign-in →
          </a>
        }
      </div>
    </div>
  `,
})
export class MigrationComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  readonly store = inject(AuthStore);

  readonly status = signal<
    'loading' | 'unavailable' | 'ready' | 'accepted' | 'declined'
  >('loading');
  readonly offer = signal<{
    id: string;
    domain: string;
    organization: string;
    status: string;
    expires_at: string;
    offered_at: string;
  } | null>(null);

  private token = '';

  async ngOnInit(): Promise<void> {
    this.token = this.route.snapshot.paramMap.get('token') || '';
    if (!this.token) {
      this.status.set('unavailable');
      return;
    }
    const offer = await this.store.migrationLookup(this.token);
    if (!offer || offer.status !== 'offered') {
      this.status.set('unavailable');
      return;
    }
    this.offer.set(offer);
    this.status.set('ready');
  }

  async onAccept(): Promise<void> {
    const ok = await this.store.migrationAccept(this.token);
    if (ok) this.status.set('accepted');
  }

  async onDecline(): Promise<void> {
    const ok = await this.store.migrationDecline(this.token);
    if (ok) this.status.set('declined');
  }
}
