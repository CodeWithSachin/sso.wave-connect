import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../store/auth.store';

/**
 * Tenantless consumer signup. Calls POST /auth/public/signup via AuthStore.
 *
 * Distinct from the existing `/register` component (tenant-scoped legacy flow
 * retained for back-compat). This component is the Google-style "create a
 * personal account" surface — the first step into a personal workspace.
 *
 * On success the browser already has a valid sso_session cookie, but the user
 * can't do much until they click the verification link — we bounce them to
 * /verify-email?pending=1 as a soft landing page.
 */
@Component({
  standalone: true,
  selector: 'app-signup',
  imports: [FormsModule, RouterLink],
  template: `
    <div class="min-h-screen bg-background flex items-center justify-center px-4 font-sans">
      <div class="bg-card text-card-foreground rounded-lg p-8 w-full max-w-md border border-border">
        <div class="mb-8 text-center">
          <h1 class="text-2xl font-bold text-foreground">Create your account</h1>
          <p class="mt-2 text-sm text-muted-foreground">
            Personal workspace — free. You can add a team later.
          </p>
        </div>

        @if (store.error()) {
          <div class="mb-4 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive" data-testid="signup-error">
            {{ store.error() }}
          </div>
        }

        <form (submit)="onSubmit(); $event.preventDefault()" class="space-y-5" data-testid="signup-form">
          <div>
            <label for="signup-name" class="block text-sm font-medium text-foreground mb-1.5">
              Your name
            </label>
            <input
              id="signup-name"
              type="text"
              required
              minlength="1"
              maxlength="100"
              autocomplete="name"
              [(ngModel)]="displayName"
              name="displayName"
              placeholder="Jane Doe"
              class="bg-input border border-border rounded-md px-4 py-3 w-full text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:outline-none"
            />
          </div>

          <div>
            <label for="signup-email" class="block text-sm font-medium text-foreground mb-1.5">
              Email
            </label>
            <input
              id="signup-email"
              type="email"
              required
              autocomplete="email"
              [(ngModel)]="email"
              name="email"
              placeholder="you@example.com"
              class="bg-input border border-border rounded-md px-4 py-3 w-full text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:outline-none"
            />
          </div>

          <div>
            <label for="signup-password" class="block text-sm font-medium text-foreground mb-1.5">
              Password
            </label>
            <input
              id="signup-password"
              type="password"
              required
              minlength="10"
              maxlength="128"
              autocomplete="new-password"
              [(ngModel)]="password"
              name="password"
              placeholder="At least 10 characters"
              class="bg-input border border-border rounded-md px-4 py-3 w-full text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:outline-none"
            />
            <p class="mt-1 text-xs text-muted-foreground">
              Minimum 10 characters. Use a passphrase for best security.
            </p>
          </div>

          <button
            type="submit"
            [disabled]="store.loading()"
            data-testid="signup-submit"
            class="bg-primary text-primary-foreground rounded-md px-4 py-3 w-full font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {{ store.loading() ? 'Creating account…' : 'Create account' }}
          </button>
        </form>

        <p class="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?
          <a routerLink="/login" class="text-primary font-medium hover:underline">Sign in</a>
        </p>
        <p class="mt-2 text-center text-xs text-muted-foreground">
          Setting up for an organization?
          <a routerLink="/signup-org" class="text-primary hover:underline">Claim a domain</a>
        </p>
      </div>
    </div>
  `,
})
export class SignupComponent {
  readonly store = inject(AuthStore);

  displayName = '';
  email = '';
  password = '';

  onSubmit(): void {
    if (!this.displayName.trim() || !this.email.trim() || this.password.length < 10) {
      return;
    }
    this.store.signup(this.email.trim(), this.password, this.displayName.trim());
  }
}
