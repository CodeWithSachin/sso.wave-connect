import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  DiscoverResponse,
  DiscoverService,
} from '../core/discover.service';
import { AuthStore } from '../store/auth.store';

/**
 * Email-first login (Phase 3 of the dual-product onboarding plan).
 *
 * Two steps:
 *
 *   Step 1 — "email" — user types their email and presses Continue.
 *     We call `/auth/public/discover?email=…` which returns one of three
 *     modes: `consumer`, `tenant_password`, `tenant_sso`.
 *
 *       consumer        → step 2 with default branding (our logo, generic UI).
 *       tenant_password → step 2 with the tenant's branding (logo + name
 *                         from the backend). Same password submission path.
 *       tenant_sso      → full-page redirect to the IdP's login URL.
 *                         Never reach step 2.
 *
 *   Step 2 — "password" — user types password and signs in. Wire is identical
 *     to the old single-form flow; `AuthStore.login` is unchanged.
 *
 * Enumeration resistance: the backend returns `consumer` for unknown
 * domains AND for malformed input AND when the DB is down. Our UI treats
 * them identically, so an attacker probing for existence sees only the
 * password field and a generic greeting regardless of outcome.
 */
@Component({
  standalone: true,
  selector: 'app-login',
  imports: [FormsModule, RouterLink],
  template: `
    <div class="min-h-screen bg-background flex items-center justify-center px-4 font-sans">
      <div class="bg-card text-card-foreground rounded-lg p-8 w-full max-w-md border border-border">
        <!-- Step indicator: email entry OR password entry -->
        <div class="mb-8 text-center">
          @if (step() === 'email') {
            <h1 class="text-2xl font-bold text-foreground">Sign in</h1>
            <p class="mt-2 text-sm text-muted-foreground">Enter your email to continue</p>
          } @else {
            <div class="flex flex-col items-center gap-3">
              @if (branding()?.logoUrl) {
                <img [src]="branding()!.logoUrl" [alt]="branding()!.name" class="h-10 w-auto" />
              }
              <h1 class="text-2xl font-bold text-foreground">
                @if (branding()) {
                  Sign in to {{ branding()!.displayName || branding()!.name }}
                } @else {
                  Welcome back
                }
              </h1>
              <p class="text-sm text-muted-foreground">{{ email() }}</p>
              <button
                type="button"
                (click)="backToEmail()"
                data-testid="login-back-to-email"
                class="text-xs text-primary hover:underline cursor-pointer"
              >
                Use a different email
              </button>
            </div>
          }
        </div>

        @if (store.error()) {
          <div class="mb-4 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive" data-testid="login-error">
            {{ store.error() }}
          </div>
        }

        @if (step() === 'email') {
          <form (submit)="onContinue(); $event.preventDefault()" class="space-y-5" data-testid="login-email-form">
            <div>
              <label for="login-email" class="block text-sm font-medium text-foreground mb-1.5">Email</label>
              <input
                id="login-email"
                type="email"
                required
                autocomplete="email"
                [(ngModel)]="emailInput"
                name="email"
                placeholder="you@example.com"
                class="bg-input border border-border rounded-md px-4 py-3 w-full text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:outline-none"
              />
            </div>
            <button
              type="submit"
              [disabled]="discovering() || !emailInput.trim()"
              data-testid="login-email-submit"
              class="bg-primary text-primary-foreground rounded-md px-4 py-3 w-full font-medium hover:opacity-90 disabled:opacity-50 cursor-pointer"
            >
              {{ discovering() ? 'Checking…' : 'Continue' }}
            </button>
          </form>
        } @else {
          <form (submit)="onSignIn(); $event.preventDefault()" class="space-y-5" data-testid="login-password-form">
            <!-- Hidden email field so password managers see the pair -->
            <input type="email" [value]="email()" autocomplete="email" hidden />
            <div>
              <label for="login-password" class="block text-sm font-medium text-foreground mb-1.5">Password</label>
              <input
                id="login-password"
                type="password"
                required
                minlength="8"
                autocomplete="current-password"
                [(ngModel)]="passwordInput"
                name="password"
                placeholder="Enter your password"
                class="bg-input border border-border rounded-md px-4 py-3 w-full text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:outline-none"
              />
            </div>
            <div class="flex justify-end">
              <a routerLink="/forgot-password" class="text-sm text-primary font-medium hover:underline">
                Forgot password?
              </a>
            </div>
            <button
              type="submit"
              [disabled]="store.loading()"
              data-testid="login-password-submit"
              class="bg-primary text-primary-foreground rounded-md px-4 py-3 w-full font-medium hover:opacity-90 disabled:opacity-50 cursor-pointer"
            >
              {{ store.loading() ? 'Signing in…' : 'Sign in' }}
            </button>
          </form>
        }

        <p class="mt-6 text-center text-sm text-muted-foreground">
          Don't have an account?
          <a routerLink="/signup" class="text-primary font-medium hover:underline">
            Create one
          </a>
        </p>
      </div>
    </div>
  `,
})
export class LoginComponent {
  private readonly discoverSvc = inject(DiscoverService);
  readonly store = inject(AuthStore);

  /** Which step of the two-step flow is showing. */
  readonly step = signal<'email' | 'password'>('email');

  /** The discovered routing decision from the email step. Null until submit. */
  readonly discovered = signal<DiscoverResponse | null>(null);

  /** While the discover request is in-flight, disable the Continue button. */
  readonly discovering = signal(false);

  emailInput = '';
  passwordInput = '';

  /** Snapshot of the email the user committed to in step 1 (for step 2 UX). */
  readonly email = signal('');

  /** Derived tenant branding from the discover response, or null. */
  readonly branding = computed(() => {
    const d = this.discovered();
    if (!d?.tenant) return null;
    return {
      name: d.tenant.name,
      displayName: d.tenant.display_name,
      logoUrl: d.tenant.logo_url,
    };
  });

  /**
   * Step 1 submit: call discover, branch by mode. SSO → full redirect.
   * consumer + tenant_password → advance to step 2.
   */
  async onContinue(): Promise<void> {
    const e = this.emailInput.trim();
    if (!e) return;
    this.discovering.set(true);
    this.store.clearError();
    try {
      const resp = await this.discoverSvc.discover(e);
      this.discovered.set(resp);
      this.email.set(e);
      if (resp.mode === 'tenant_sso' && resp.sso?.login_url) {
        // Full-page redirect. Don't advance to step 2.
        window.location.href = resp.sso.login_url;
        return;
      }
      this.step.set('password');
    } finally {
      this.discovering.set(false);
    }
  }

  /** Step 2 submit: same login call the single-form flow used. */
  onSignIn(): void {
    if (!this.email() || this.passwordInput.length < 8) return;
    this.store.login(this.email(), this.passwordInput);
  }

  /** Return to step 1 so the user can retype a different email. */
  backToEmail(): void {
    this.step.set('email');
    this.passwordInput = '';
    this.discovered.set(null);
    this.store.clearError();
  }
}
