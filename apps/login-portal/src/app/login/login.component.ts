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
    <div class="wc-dot-grid flex min-h-screen flex-col items-center bg-background px-5 pt-12 pb-8">
      <div class="w-full max-w-[400px]">
        <!-- Wordmark -->
        <div class="mb-8 flex justify-center">
          <div class="inline-flex items-center gap-2">
            <img src="logo-mark.svg" alt="" class="h-[22px] w-[22px]" />
            <span class="text-[16px] font-semibold tracking-tight text-foreground">
              wave<span class="wc-dot">·</span>connect
            </span>
          </div>
        </div>

        <!-- Auth card -->
        <div class="rounded-lg border border-border bg-card px-7 pt-7 pb-6 shadow-sm">
          <!-- Step indicator: email entry OR password entry -->
          @if (step() === 'email') {
            <h1 class="text-[24px] font-semibold leading-tight tracking-tight text-foreground">
              Sign in
            </h1>
            <p class="mt-1.5 mb-6 text-[14px] text-muted-foreground">
              Enter your email to continue.
            </p>
          } @else {
            <button
              type="button"
              (click)="backToEmail()"
              data-testid="login-back-to-email"
              class="mb-3 -ml-2 inline-flex h-7 items-center gap-1 rounded-md px-2 text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <span aria-hidden="true">←</span>
              Back
            </button>
            @if (branding()?.logoUrl) {
              <img
                [src]="branding()!.logoUrl"
                [alt]="branding()!.name"
                class="mb-3 h-8 w-auto"
              />
            }
            <h1 class="text-[24px] font-semibold leading-tight tracking-tight text-foreground">
              @if (branding()) {
                Sign in to {{ branding()!.displayName || branding()!.name }}
              } @else {
                Welcome back
              }
            </h1>
            <p class="mt-1.5 mb-4 font-mono text-[13px] text-muted-foreground">
              {{ email() }}
            </p>
          }

          <!-- Tenant chip for discovered tenants -->
          @if (step() === 'password' && branding()) {
            <div class="mb-[18px] flex items-center gap-2.5 rounded-md bg-muted px-3 py-2.5">
              @if (branding()!.logoUrl) {
                <img
                  [src]="branding()!.logoUrl"
                  [alt]="branding()!.name"
                  class="h-7 w-7 rounded-[6px] object-cover"
                />
              } @else {
                <div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-primary text-[12px] font-semibold text-primary-foreground">
                  {{ (branding()!.displayName || branding()!.name).charAt(0) }}
                </div>
              }
              <div class="min-w-0 leading-tight">
                <div class="truncate text-[13px] font-medium text-foreground">
                  {{ branding()!.displayName || branding()!.name }}
                </div>
                @if (branding()!.name) {
                  <div class="truncate font-mono text-[11px] text-muted-foreground">
                    {{ branding()!.name }}
                  </div>
                }
              </div>
            </div>
          }

          @if (store.error()) {
            <div
              class="mb-4 rounded-md border border-transparent bg-destructive/10 px-3.5 py-3 text-[13px] text-destructive"
              data-testid="login-error"
              role="alert"
            >
              {{ store.error() }}
            </div>
          }

          @if (step() === 'email') {
            <form
              (submit)="onContinue(); $event.preventDefault()"
              class="space-y-4"
              data-testid="login-email-form"
            >
              <div>
                <label
                  for="login-email"
                  class="mb-1.5 block text-[13px] font-medium text-foreground"
                >
                  Email address
                </label>
                <input
                  id="login-email"
                  type="email"
                  required
                  autocomplete="email"
                  autofocus
                  [(ngModel)]="emailInput"
                  name="email"
                  placeholder="you@example.com"
                  class="block h-9 w-full rounded-md border border-input bg-background px-3 font-sans text-[14px] text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-[3px] focus:ring-ring/35"
                />
              </div>
              <button
                type="submit"
                [disabled]="discovering() || !emailInput.trim()"
                data-testid="login-email-submit"
                class="inline-flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-3.5 text-[14px] font-medium text-primary-foreground transition-colors hover:bg-[color:var(--wc-coral-hover)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {{ discovering() ? 'Checking…' : 'Continue' }}
                @if (!discovering()) {
                  <span aria-hidden="true">→</span>
                }
              </button>
            </form>
          } @else {
            <form
              (submit)="onSignIn(); $event.preventDefault()"
              class="space-y-4"
              data-testid="login-password-form"
            >
              <input type="email" [value]="email()" autocomplete="email" hidden />
              <div>
                <div class="mb-1.5 flex items-center justify-between">
                  <label
                    for="login-password"
                    class="block text-[13px] font-medium text-foreground"
                  >
                    Password
                  </label>
                  <a
                    routerLink="/forgot-password"
                    class="text-[13px] font-medium text-primary transition-colors hover:text-[color:var(--wc-coral-hover)]"
                  >
                    Forgot?
                  </a>
                </div>
                <input
                  id="login-password"
                  type="password"
                  required
                  minlength="8"
                  autocomplete="current-password"
                  autofocus
                  [(ngModel)]="passwordInput"
                  name="password"
                  placeholder="Enter your password"
                  class="block h-9 w-full rounded-md border border-input bg-background px-3 font-sans text-[14px] text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-[3px] focus:ring-ring/35"
                />
              </div>
              <button
                type="submit"
                [disabled]="store.loading()"
                data-testid="login-password-submit"
                class="inline-flex h-9 w-full cursor-pointer items-center justify-center rounded-md bg-primary px-3.5 text-[14px] font-medium text-primary-foreground transition-colors hover:bg-[color:var(--wc-coral-hover)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {{ store.loading() ? 'Signing in…' : 'Sign in' }}
              </button>
            </form>
          }
        </div>

        <!-- Footer below card -->
        <p class="mt-5 text-center text-[13px] text-muted-foreground">
          No account yet?
          <a
            routerLink="/signup"
            class="font-medium text-primary transition-colors hover:text-[color:var(--wc-coral-hover)]"
          >
            Create one
          </a>
        </p>

        <div class="mt-10 flex items-center justify-center gap-4 text-[12px] text-muted-foreground">
          <a href="#" class="transition-colors hover:text-foreground">Privacy</a>
          <a href="#" class="transition-colors hover:text-foreground">Terms</a>
          <a href="#" class="transition-colors hover:text-foreground">Status</a>
        </div>
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
    // Forward the tenant id resolved by /auth/public/discover (if any) so the
    // backend can find the user's membership in their org tenant rather than
    // the dev-default tenant the global interceptor would otherwise apply.
    const discoveredTenantId = this.discovered()?.tenant?.id;
    this.store.login(this.email(), this.passwordInput, discoveredTenantId);
  }

  /** Return to step 1 so the user can retype a different email. */
  backToEmail(): void {
    this.step.set('email');
    this.passwordInput = '';
    this.discovered.set(null);
    this.store.clearError();
  }
}
