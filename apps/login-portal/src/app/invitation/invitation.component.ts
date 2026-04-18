import { Component, computed, inject, signal } from '@angular/core';
import { HttpClient, httpResource } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

/**
 * Phase 6 tenant-invitation accept/decline landing page. Mounted at
 * `/invitation/:token`.
 *
 * Flow mirrors MigrationComponent's structure (same team's UX):
 *
 *   1. Resource loads GET /auth/public/invitation/:token. 410 → opaque
 *      "unavailable" view (invalid / expired / resolved all collapse).
 *   2. On `offered`, render accept/decline. If `needs_password_setup` is
 *      true, require a password field before accept.
 *   3. Accept POST → server sets membership.joined_at + mints session;
 *      UI pivots to "you're in" with a link to /login.
 *   4. Decline POST → UI pivots to declined view.
 *
 * Zoneless-native via `httpResource` + signals; action handlers imperative.
 */
@Component({
  standalone: true,
  selector: 'app-invitation',
  imports: [FormsModule, RouterLink],
  template: `
    <div class="min-h-screen bg-background flex items-center justify-center px-4 font-sans">
      <div class="bg-card text-card-foreground rounded-lg p-8 w-full max-w-lg border border-border">
        @if (view() === 'loading') {
          <h1 class="text-xl font-semibold">Loading your invitation…</h1>
          <p class="mt-3 text-sm text-muted-foreground">One moment.</p>
        } @else if (view() === 'unavailable') {
          <h1 class="text-xl font-semibold text-destructive" data-testid="invitation-unavailable">
            This invitation link is no longer valid
          </h1>
          <p class="mt-3 text-sm text-muted-foreground">
            It may have already been used, declined, or expired. Ask the
            person who invited you to send a fresh one.
          </p>
          <a routerLink="/login" class="mt-6 inline-block text-primary font-medium hover:underline">
            Back to sign-in →
          </a>
        } @else if (view() === 'ready') {
          <h1 class="text-xl font-semibold" data-testid="invitation-ready">
            Join {{ offer()?.tenant_name }}?
          </h1>
          <p class="mt-3 text-sm text-muted-foreground">
            You're invited to join <strong>{{ offer()?.tenant_name }}</strong> as
            <strong>{{ offer()?.role }}</strong>. This link was sent to
            <strong>{{ offer()?.invited_email }}</strong>.
          </p>

          @if (offer()?.needs_password_setup) {
            <div class="mt-6">
              <label for="invite-password" class="block text-sm font-medium text-foreground mb-2">
                Set a password to finish setting up your account
              </label>
              <input
                id="invite-password"
                type="password"
                [(ngModel)]="password"
                name="invite-password"
                autocomplete="new-password"
                minlength="10"
                maxlength="128"
                placeholder="At least 10 characters"
                data-testid="invitation-password"
                class="bg-input border border-border rounded-md px-4 py-2 w-full text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:outline-none text-sm"
              />
              <p class="mt-2 text-xs text-muted-foreground">
                You'll use this password to sign in to {{ offer()?.tenant_name }}.
              </p>
            </div>
          }

          <div class="mt-6 grid gap-3">
            <button
              type="button"
              (click)="onAccept()"
              [disabled]="loading() || (offer()?.needs_password_setup && password.length < 10)"
              data-testid="invitation-accept"
              class="bg-primary text-primary-foreground rounded-md px-4 py-2 w-full font-medium hover:opacity-90 disabled:opacity-50 cursor-pointer text-sm"
            >
              {{ loading() ? 'Working…' : 'Accept and join ' + (offer()?.tenant_name || 'the team') }}
            </button>
            <button
              type="button"
              (click)="onDecline()"
              [disabled]="loading()"
              data-testid="invitation-decline"
              class="bg-secondary text-secondary-foreground rounded-md px-4 py-2 w-full font-medium hover:opacity-90 disabled:opacity-50 cursor-pointer text-sm"
            >
              Decline
            </button>
          </div>

          @if (error()) {
            <p class="mt-4 text-sm text-destructive" role="alert">{{ error() }}</p>
          }
        } @else if (view() === 'accepted') {
          <h1 class="text-xl font-semibold" data-testid="invitation-accepted">
            You're in. Welcome to {{ offer()?.tenant_name }}.
          </h1>
          <p class="mt-3 text-sm text-muted-foreground">
            Sign in to continue — we've set up your session so the next
            sign-in lands you straight in the team's workspace.
          </p>
          <a routerLink="/login" class="mt-6 inline-block text-primary font-medium hover:underline">
            Go to sign-in →
          </a>
        } @else if (view() === 'declined') {
          <h1 class="text-xl font-semibold" data-testid="invitation-declined">
            Invitation declined.
          </h1>
          <p class="mt-3 text-sm text-muted-foreground">
            No worries — nothing has changed on your account. If you
            reconsider, ask the admin to resend the invitation.
          </p>
          <a routerLink="/login" class="mt-6 inline-block text-primary font-medium hover:underline">
            Back to sign-in →
          </a>
        }
      </div>
    </div>
  `,
})
export class InvitationComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly http = inject(HttpClient);

  private readonly paramMap = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  private readonly token = computed(() => this.paramMap().get('token') || '');

  /**
   * GET /auth/public/invitation/:token — returns the offer metadata +
   * `needs_password_setup` flag that drives the password-field toggle in
   * the template. Empty token short-circuits the fetch.
   */
  readonly offerResource = httpResource<InvitationOffer>(() => {
    const t = this.token();
    if (!t) return undefined;
    return `${environment.identityServiceUrl}/auth/public/invitation/${encodeURIComponent(t)}`;
  });

  readonly offer = computed(() => this.offerResource.value());
  readonly loading = signal(false);
  readonly error = signal('');
  password = '';

  /**
   * Post-action phase: 'initial' defers to the resource; 'accepted'/
   * 'declined' are set by onAccept/onDecline after a successful POST and
   * are sticky even though the underlying row status has changed
   * server-side.
   */
  private readonly phase = signal<'initial' | 'accepted' | 'declined'>('initial');

  readonly view = computed<'loading' | 'unavailable' | 'ready' | 'accepted' | 'declined'>(() => {
    const p = this.phase();
    if (p === 'accepted' || p === 'declined') return p;
    if (this.offerResource.isLoading()) return 'loading';
    if (this.offerResource.error()) return 'unavailable';
    const o = this.offerResource.value();
    if (!o) return 'unavailable';
    return 'ready';
  });

  async onAccept(): Promise<void> {
    const t = this.token();
    const o = this.offer();
    if (!t || !o) return;
    this.loading.set(true);
    this.error.set('');
    try {
      const body: { password?: string } = {};
      if (o.needs_password_setup) {
        if (this.password.length < 10) {
          this.error.set('Pick a password with at least 10 characters.');
          this.loading.set(false);
          return;
        }
        body.password = this.password;
      }
      await firstValueFrom(
        this.http.post(
          `${environment.identityServiceUrl}/auth/public/invitation/${encodeURIComponent(t)}/accept`,
          body,
          { withCredentials: true },
        ),
      );
      this.phase.set('accepted');
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      const errorCode = (err as { error?: { error?: string } })?.error?.error;
      if (status === 410) {
        this.error.set('');
        this.phase.set('initial');
        this.offerResource.reload();
      } else if (errorCode === 'password_required') {
        this.error.set('Set a password to finish accepting the invitation.');
      } else if (errorCode === 'password_not_allowed') {
        this.error.set('Sign in with your existing password instead.');
      } else {
        this.error.set('We couldn\'t accept this invitation. Please try again.');
      }
    } finally {
      this.loading.set(false);
    }
  }

  async onDecline(): Promise<void> {
    const t = this.token();
    if (!t) return;
    this.loading.set(true);
    this.error.set('');
    try {
      await firstValueFrom(
        this.http.post(
          `${environment.identityServiceUrl}/auth/public/invitation/${encodeURIComponent(t)}/decline`,
          {},
          { withCredentials: true },
        ),
      );
      this.phase.set('declined');
    } catch {
      this.error.set('We couldn\'t record your response. Please try again.');
    } finally {
      this.loading.set(false);
    }
  }
}

/** Wire shape for `GET /auth/public/invitation/:token`. */
interface InvitationOffer {
  tenant_name: string;
  role: string;
  invited_email: string;
  needs_password_setup: boolean;
  expires_at: string;
}
