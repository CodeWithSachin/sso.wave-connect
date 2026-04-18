import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthStore } from '../store/auth.store';

/**
 * Organization signup (Phase 2). Collects org name + slug + domain + admin
 * credentials; on success routes to /signup-org/verify-domain with the claim
 * id + TXT instructions passed via query string (the verify-domain component
 * reads them there and renders copy-paste DNS details).
 *
 * Slug is auto-derived from org name as the user types but remains editable —
 * standard Slack/Auth0 pattern.
 */
@Component({
  standalone: true,
  selector: 'app-signup-org',
  imports: [FormsModule, RouterLink],
  template: `
    <div class="min-h-screen bg-background flex items-center justify-center px-4 py-8 font-sans">
      <div class="bg-card text-card-foreground rounded-lg p-8 w-full max-w-lg border border-border">
        <div class="mb-8 text-center">
          <h1 class="text-2xl font-bold text-foreground">Create your workspace</h1>
          <p class="mt-2 text-sm text-muted-foreground">
            Claim your company's domain — you'll verify ownership via DNS in the next step.
          </p>
        </div>

        @if (store.error()) {
          <div
            class="mb-4 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive"
            data-testid="signup-org-error"
          >
            {{ store.error() }}
          </div>
        }

        <form (submit)="onSubmit(); $event.preventDefault()" class="space-y-4" data-testid="signup-org-form">
          <div>
            <label for="org-name" class="block text-sm font-medium text-foreground mb-1.5">Organization name</label>
            <input
              id="org-name"
              type="text"
              required
              minlength="1"
              maxlength="255"
              [(ngModel)]="orgName"
              (ngModelChange)="autoSlug($event)"
              name="orgName"
              placeholder="Acme Corporation"
              class="bg-input border border-border rounded-md px-4 py-3 w-full text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:outline-none"
            />
          </div>

          <div>
            <label for="org-slug" class="block text-sm font-medium text-foreground mb-1.5">Workspace URL</label>
            <div class="flex items-center gap-1">
              <span class="text-sm text-muted-foreground">wave-connect.com/</span>
              <input
                id="org-slug"
                type="text"
                required
                minlength="3"
                maxlength="60"
                pattern="[a-z0-9-]+"
                [(ngModel)]="orgSlug"
                name="orgSlug"
                placeholder="acme-corp"
                class="bg-input border border-border rounded-md px-3 py-2 flex-1 text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:outline-none font-mono text-sm"
              />
            </div>
            <p class="mt-1 text-xs text-muted-foreground">Lowercase letters, digits, and hyphens only.</p>
          </div>

          <div>
            <label for="org-domain" class="block text-sm font-medium text-foreground mb-1.5">Company domain</label>
            <input
              id="org-domain"
              type="text"
              required
              minlength="4"
              maxlength="255"
              [(ngModel)]="domain"
              name="domain"
              placeholder="acme.com"
              class="bg-input border border-border rounded-md px-4 py-3 w-full text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:outline-none font-mono text-sm"
            />
            <p class="mt-1 text-xs text-muted-foreground">Root domain only (e.g. acme.com, not www.acme.com).</p>
          </div>

          <hr class="border-border my-4" />

          <div>
            <label for="org-fullname" class="block text-sm font-medium text-foreground mb-1.5">Your name</label>
            <input
              id="org-fullname"
              type="text"
              required
              [(ngModel)]="fullName"
              name="fullName"
              placeholder="Jane Doe"
              class="bg-input border border-border rounded-md px-4 py-3 w-full text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:outline-none"
            />
          </div>

          <div>
            <label for="org-email" class="block text-sm font-medium text-foreground mb-1.5">Work email</label>
            <input
              id="org-email"
              type="email"
              required
              [(ngModel)]="email"
              name="email"
              placeholder="jane@acme.com"
              class="bg-input border border-border rounded-md px-4 py-3 w-full text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:outline-none"
            />
            <p class="mt-1 text-xs text-muted-foreground">
              Must end with @{{ domain || 'your-domain.com' }} — proves you use the domain.
            </p>
          </div>

          <div>
            <label for="org-password" class="block text-sm font-medium text-foreground mb-1.5">Password</label>
            <input
              id="org-password"
              type="password"
              required
              minlength="10"
              maxlength="128"
              [(ngModel)]="password"
              name="password"
              placeholder="At least 10 characters"
              class="bg-input border border-border rounded-md px-4 py-3 w-full text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:outline-none"
            />
          </div>

          <button
            type="submit"
            [disabled]="store.loading()"
            data-testid="signup-org-submit"
            class="bg-primary text-primary-foreground rounded-md px-4 py-3 w-full font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {{ store.loading() ? 'Creating workspace…' : 'Continue to domain verification' }}
          </button>
        </form>

        <p class="mt-6 text-center text-sm text-muted-foreground">
          Just need a personal account?
          <a routerLink="/signup" class="text-primary font-medium hover:underline">Sign up as an individual</a>
        </p>
      </div>
    </div>
  `,
})
export class SignupOrgComponent {
  private readonly router = inject(Router);
  readonly store = inject(AuthStore);

  orgName = '';
  orgSlug = '';
  domain = '';
  fullName = '';
  email = '';
  password = '';

  private slugManuallyEdited = false;

  /**
   * As the org name changes, derive the slug (unless the user typed directly
   * into the slug field already). Matches the Slack/Auth0 pattern where slug
   * suggestions stop once the user makes any edit.
   */
  autoSlug(name: string): void {
    if (this.slugManuallyEdited) return;
    this.orgSlug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
  }

  async onSubmit(): Promise<void> {
    const result = await this.store.signupOrg({
      org_name: this.orgName.trim(),
      org_slug: this.orgSlug.trim(),
      domain: this.domain.trim().toLowerCase(),
      email: this.email.trim(),
      password: this.password,
      full_name: this.fullName.trim(),
    });
    if (result) {
      this.router.navigate(['/signup-org/verify-domain'], {
        queryParams: {
          domainId: result.domainId,
          domain: result.domain,
          host: result.host,
          value: result.value,
          tenantId: result.tenantId,
        },
      });
    }
  }
}
