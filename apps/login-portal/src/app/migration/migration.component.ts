import { Component, computed, inject, signal } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { environment } from '../../environments/environment';
import { AuthStore } from '../store/auth.store';

/**
 * Phase 4 post-claim migration landing page. Mounted at `/migration/:token`.
 *
 * Flow:
 *   1. Resource loads `/auth/public/migration/:token`. Unknown/expired/
 *      already-resolved tokens all collapse into 410-gone from the server;
 *      we render the same "unavailable" view for every non-success path
 *      (enumeration resistance, mirrored from the backend shape).
 *   2. On `offered`, render accept/decline buttons.
 *   3. Accept POST → server revokes sessions + moves membership; UI flips
 *      to the "accepted" view prompting sign-in.
 *   4. Decline POST → server flips status; UI shows the declined view.
 *
 * Zoneless-native implementation: idempotent GET goes through
 * `httpResource` (Angular 21); action handlers stay imperative because
 * they're mutations, not fetches. A single `phase` signal layers
 * post-action state on top of the resource so the template decides the
 * right view from two inputs (the resource status + the last action).
 */
@Component({
  standalone: true,
  selector: 'app-migration',
  imports: [RouterLink, DatePipe],
  template: `
    <div class="min-h-screen bg-background flex items-center justify-center px-4 font-sans">
      <div class="bg-card text-card-foreground rounded-lg p-8 w-full max-w-lg border border-border">
        @if (view() === 'loading') {
          <h1 class="text-xl font-semibold">Loading your invitation…</h1>
          <p class="mt-3 text-sm text-muted-foreground">One moment.</p>
        } @else if (view() === 'unavailable') {
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
        } @else if (view() === 'ready') {
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
        } @else if (view() === 'accepted') {
          <h1 class="text-xl font-semibold" data-testid="migration-accepted">
            You're in. Sign back in to {{ offer()?.organization }}.
          </h1>
          <p class="mt-3 text-sm text-muted-foreground">
            Your account now belongs to the team workspace. Sign in again to continue under the team's branding.
          </p>
          <a routerLink="/login" class="mt-6 inline-block text-primary font-medium hover:underline">
            Go to sign-in →
          </a>
        } @else if (view() === 'declined') {
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
export class MigrationComponent {
  private readonly route = inject(ActivatedRoute);
  readonly store = inject(AuthStore);

  /**
   * Track the `:token` path param reactively so deep-link re-navigations
   * between two different tokens refetch correctly (not a common flow,
   * but zero-cost to support). toSignal avoids manual subscription
   * management — the underlying observable completes at component
   * destruction automatically.
   */
  private readonly paramMap = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });

  private readonly token = computed(() => this.paramMap().get('token') || '');

  /**
   * GET /auth/public/migration/:token. Returning `undefined` from the
   * request factory disables fetching — this handles the edge case of an
   * empty token (browser landing on /migration/ with no path segment,
   * which the router shouldn't allow but we guard anyway).
   */
  readonly offerResource = httpResource<MigrationOffer>(() => {
    const t = this.token();
    if (!t) return undefined;
    return `${environment.identityServiceUrl}/auth/public/migration/${encodeURIComponent(t)}`;
  });

  readonly offer = computed(() => this.offerResource.value());

  /**
   * `phase` layers post-action state on top of the resource. 'initial'
   * means "defer to resource"; 'accepted' / 'declined' are set by the
   * action handlers after a successful POST and are sticky — they
   * override the resource view even though the underlying row's status
   * has also changed server-side.
   */
  private readonly phase = signal<'initial' | 'accepted' | 'declined'>('initial');

  /**
   * Single template source of truth for which branch to render. Combines
   * the resource's loading/error signals, the offer's status field, and
   * any post-action phase the user has triggered.
   */
  readonly view = computed<'loading' | 'unavailable' | 'ready' | 'accepted' | 'declined'>(() => {
    const p = this.phase();
    if (p === 'accepted' || p === 'declined') return p;
    if (this.offerResource.isLoading()) return 'loading';
    if (this.offerResource.error()) return 'unavailable';
    const o = this.offerResource.value();
    if (!o || o.status !== 'offered') return 'unavailable';
    return 'ready';
  });

  async onAccept(): Promise<void> {
    const t = this.token();
    if (!t) return;
    const ok = await this.store.migrationAccept(t);
    if (ok) this.phase.set('accepted');
  }

  async onDecline(): Promise<void> {
    const t = this.token();
    if (!t) return;
    const ok = await this.store.migrationDecline(t);
    if (ok) this.phase.set('declined');
  }
}

/** Wire shape for `GET /auth/public/migration/:token`. */
interface MigrationOffer {
  id: string;
  domain: string;
  organization: string;
  status: string;
  expires_at: string;
  offered_at: string;
}
