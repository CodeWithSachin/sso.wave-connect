import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthStore } from '../store/auth.store';

/**
 * Dual-mode page:
 *
 *   /verify-email?token=<raw>       → consume mode: POSTs the token; shows
 *                                     success / invalid state.
 *   /verify-email?pending=1&email=  → waiting mode: shows "check your inbox"
 *                                     with a resend button. Used as the
 *                                     post-signup landing.
 *   /verify-email                   → plain waiting mode (no email hint).
 *
 * Mode is driven by query params so the same component serves both flows
 * without router-level branching.
 */
@Component({
  standalone: true,
  selector: 'app-verify-email',
  imports: [FormsModule, RouterLink],
  template: `
    <div class="min-h-screen bg-background flex items-center justify-center px-4 font-sans">
      <div class="bg-card text-card-foreground rounded-lg p-8 w-full max-w-md border border-border text-center">
        @if (mode() === 'consuming') {
          <h1 class="text-xl font-semibold">Verifying your email…</h1>
          <p class="mt-3 text-sm text-muted-foreground">Hang tight — this only takes a moment.</p>
        } @else if (mode() === 'success') {
          <h1 class="text-xl font-semibold text-foreground" data-testid="verify-success">
            Email verified ✓
          </h1>
          <p class="mt-3 text-sm text-muted-foreground">
            You can now sign in or return to the app.
          </p>
          <a routerLink="/login" class="mt-6 inline-block text-primary font-medium hover:underline">
            Go to sign-in →
          </a>
        } @else if (mode() === 'failed') {
          <h1 class="text-xl font-semibold text-destructive" data-testid="verify-failed">
            Link invalid or expired
          </h1>
          <p class="mt-3 text-sm text-muted-foreground">
            {{ store.error() || 'This verification link has already been used or has expired.' }}
          </p>
          <div class="mt-6 space-y-3">
            <input
              type="email"
              [(ngModel)]="resendEmail"
              placeholder="Enter your email to get a new link"
              class="bg-input border border-border rounded-md px-4 py-2 w-full text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:outline-none text-sm"
            />
            <button
              type="button"
              (click)="onResend()"
              [disabled]="store.loading() || !resendEmail.trim()"
              class="bg-primary text-primary-foreground rounded-md px-4 py-2 w-full font-medium hover:opacity-90 disabled:opacity-50 cursor-pointer text-sm"
            >
              {{ store.loading() ? 'Sending…' : 'Send a new link' }}
            </button>
            @if (resent()) {
              <p class="text-xs text-muted-foreground">If that email is registered, a fresh link is on its way.</p>
            }
          </div>
        } @else if (mode() === 'waiting') {
          <h1 class="text-xl font-semibold text-foreground" data-testid="verify-waiting">
            Check your inbox
          </h1>
          <p class="mt-3 text-sm text-muted-foreground">
            @if (emailHint()) {
              We sent a verification link to <span class="font-medium">{{ emailHint() }}</span>.
            } @else {
              We sent you a verification link.
            }
            Click it to activate your account.
          </p>
          <div class="mt-6 space-y-3">
            <button
              type="button"
              (click)="onResend()"
              [disabled]="store.loading() || !(resendEmail.trim() || emailHint())"
              class="bg-secondary text-secondary-foreground rounded-md px-4 py-2 w-full font-medium hover:opacity-90 disabled:opacity-50 cursor-pointer text-sm"
            >
              {{ store.loading() ? 'Sending…' : 'Resend verification email' }}
            </button>
            @if (resent()) {
              <p class="text-xs text-muted-foreground">If that email is registered, a fresh link is on its way.</p>
            }
          </div>
          <p class="mt-6 text-xs text-muted-foreground">
            Wrong email? <a routerLink="/signup" class="text-primary hover:underline">Start over</a>
          </p>
        }
      </div>
    </div>
  `,
})
export class VerifyEmailComponent {
  private readonly route = inject(ActivatedRoute);
  readonly store = inject(AuthStore);

  // Snapshot is read once at construction. The page is a leaf landing route —
  // params don't change while it's mounted, so snapshot is sufficient and
  // avoids an OnInit hook entirely.
  private readonly params = this.route.snapshot.queryParamMap;
  private readonly token = this.params.get('token');
  private readonly emailParam = this.params.get('email') ?? '';

  // 'consuming' iff a token is present; otherwise the page just shows the
  // "check your inbox" CTA. The verifyEmail() promise below transitions
  // 'consuming' → 'success'/'failed'.
  readonly mode = signal<'consuming' | 'success' | 'failed' | 'waiting'>(
    this.token ? 'consuming' : 'waiting',
  );
  readonly emailHint = signal<string>(this.emailParam);
  readonly resent = signal(false);
  resendEmail = this.emailParam;

  // Exposed for template debugging; not currently used.
  readonly summary = computed(() => ({ mode: this.mode(), email: this.emailHint() }));

  constructor() {
    if (this.token) {
      // Fire and forget — the result lands on the `mode` signal.
      this.store.verifyEmail(this.token).then((ok) => {
        this.mode.set(ok ? 'success' : 'failed');
      });
    }
  }

  async onResend(): Promise<void> {
    const target = this.resendEmail.trim() || this.emailHint();
    if (!target) return;
    await this.store.resendVerification(target);
    this.resent.set(true);
  }
}
