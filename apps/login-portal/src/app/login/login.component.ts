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
    <div class="min-h-screen bg-background p-4 md:p-6 lg:p-8 font-sans">
      <div class="mx-auto grid min-h-[calc(100vh-2rem)] md:min-h-[calc(100vh-3rem)] lg:min-h-[calc(100vh-4rem)] w-full max-w-[1400px] overflow-hidden rounded-[32px] bg-card shadow-lg lg:grid-cols-[minmax(0,1fr)_minmax(0,480px)]">
        <!-- Hero cover (SnowUI dark panel with diagonal hairlines) -->
        <aside class="relative hidden overflow-hidden sui-hero-cover lg:block">
          <svg class="absolute inset-0 h-full w-full" preserveAspectRatio="none" aria-hidden="true">
            <g stroke="rgba(255,255,255,0.08)" stroke-width="1" fill="none">
              <line x1="20%" y1="0" x2="80%" y2="100%" />
              <line x1="40%" y1="0" x2="100%" y2="80%" />
              <line x1="60%" y1="0" x2="120%" y2="60%" />
              <line x1="0" y1="50%" x2="100%" y2="130%" />
            </g>
          </svg>

          <div class="relative flex h-full flex-col justify-between p-12 xl:p-16 text-[#E5ECF6]">
            <div class="flex items-center gap-3">
              <img src="snowui-mark.svg" alt="" class="h-9 w-9" />
              <span class="text-[15px] font-bold tracking-tight">WaveConnect</span>
            </div>

            <div class="max-w-xl">
              <h2 class="text-5xl xl:text-6xl font-bold leading-[1.02] tracking-tight text-[#E5ECF6]">
                Welcome<br />back.
              </h2>
              <p class="mt-6 text-lg leading-relaxed text-[#E5ECF6]/70">
                Sign in to your workspace to manage identities, access, and the apps your teams
                depend on.
              </p>
              <a
                href="https://snowui.byewind.com"
                target="_blank"
                rel="noreferrer"
                class="sui-link mt-10 inline-flex items-center gap-1.5 text-base"
              >
                Made with SnowUI <span aria-hidden="true">→</span>
              </a>
            </div>

            <div class="flex items-center justify-between text-xs text-white/40">
              <span>© {{ year }} WaveConnect. All rights reserved.</span>
              <div class="flex items-center gap-4">
                <a href="#" class="transition-colors hover:text-white/70">Privacy</a>
                <a href="#" class="transition-colors hover:text-white/70">Terms</a>
              </div>
            </div>
          </div>
        </aside>

        <!-- Form panel -->
        <section class="flex items-center justify-center p-8 sm:p-12">
          <div class="w-full max-w-sm">
            <!-- Mobile-only brand row -->
            <div class="mb-8 flex items-center gap-2 lg:hidden">
              <img src="snowui-mark.svg" alt="" class="h-7 w-7" />
              <span class="text-[14px] font-bold tracking-tight text-foreground">WaveConnect</span>
            </div>

            <!-- Step indicator: email entry OR password entry -->
            <div class="mb-8">
              @if (step() === 'email') {
                <h1 class="text-3xl font-bold tracking-tight text-foreground">Sign in</h1>
                <p class="mt-2 text-sm text-muted-foreground">
                  Enter your email to continue to your workspace.
                </p>
              } @else {
                <div class="flex flex-col items-start gap-3">
                  @if (branding()?.logoUrl) {
                    <img
                      [src]="branding()!.logoUrl"
                      [alt]="branding()!.name"
                      class="h-10 w-auto"
                    />
                  }
                  <h1 class="text-3xl font-bold tracking-tight text-foreground">
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
                    class="sui-link cursor-pointer text-xs"
                  >
                    Use a different email <span aria-hidden="true">→</span>
                  </button>
                </div>
              }
            </div>

            @if (store.error()) {
              <div
                class="mb-4 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive"
                data-testid="login-error"
                role="alert"
              >
                {{ store.error() }}
              </div>
            }

            @if (step() === 'email') {
              <form
                (submit)="onContinue(); $event.preventDefault()"
                class="space-y-5"
                data-testid="login-email-form"
              >
                <div>
                  <label
                    for="login-email"
                    class="mb-1.5 block text-sm font-medium text-foreground"
                  >
                    Email
                  </label>
                  <input
                    id="login-email"
                    type="email"
                    required
                    autocomplete="email"
                    [(ngModel)]="emailInput"
                    name="email"
                    placeholder="you@example.com"
                    class="w-full rounded-xl border border-border bg-input px-4 py-3 text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-4 focus:ring-ring/20"
                  />
                </div>
                <button
                  type="submit"
                  [disabled]="discovering() || !emailInput.trim()"
                  data-testid="login-email-submit"
                  class="w-full cursor-pointer rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground transition-colors hover:bg-[#000] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {{ discovering() ? 'Checking…' : 'Continue' }}
                </button>
              </form>
            } @else {
              <form
                (submit)="onSignIn(); $event.preventDefault()"
                class="space-y-5"
                data-testid="login-password-form"
              >
                <!-- Hidden email field so password managers see the pair -->
                <input type="email" [value]="email()" autocomplete="email" hidden />
                <div>
                  <label
                    for="login-password"
                    class="mb-1.5 block text-sm font-medium text-foreground"
                  >
                    Password
                  </label>
                  <input
                    id="login-password"
                    type="password"
                    required
                    minlength="8"
                    autocomplete="current-password"
                    [(ngModel)]="passwordInput"
                    name="password"
                    placeholder="Enter your password"
                    class="w-full rounded-xl border border-border bg-input px-4 py-3 text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-4 focus:ring-ring/20"
                  />
                </div>
                <div class="flex justify-end">
                  <a routerLink="/forgot-password" class="sui-link text-sm">
                    Forgot password? <span aria-hidden="true">→</span>
                  </a>
                </div>
                <button
                  type="submit"
                  [disabled]="store.loading()"
                  data-testid="login-password-submit"
                  class="w-full cursor-pointer rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground transition-colors hover:bg-[#000] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {{ store.loading() ? 'Signing in…' : 'Sign in' }}
                </button>
              </form>
            }

            <p class="mt-8 text-center text-sm text-muted-foreground">
              Don't have an account?
              <a routerLink="/signup" class="sui-link">
                Create one <span aria-hidden="true">→</span>
              </a>
            </p>
          </div>
        </section>
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

  readonly year = new Date().getFullYear();

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
