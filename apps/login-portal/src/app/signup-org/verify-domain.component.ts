import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthStore } from '../store/auth.store';

/**
 * Domain-verification waiting page. Shows the TXT record the admin needs to
 * publish + a "Verify now" button that triggers an on-demand DNS lookup on
 * the backend. The background cron also polls every 10 min — so patient admins
 * can close this page and come back later.
 *
 * Query params (set by SignupOrgComponent.onSubmit after /signup-org succeeds):
 *   domainId, domain, host, value, tenantId
 *
 * States:
 *   - 'waiting' — instructions + Verify button (default)
 *   - 'checking' — button pressed; awaiting response
 *   - 'verified' — outcome: "verified"
 *   - 'still_pending' — outcome: "pending" (TXT not yet observable)
 *   - 'error' — unexpected failure
 */
@Component({
  standalone: true,
  selector: 'app-verify-domain',
  imports: [RouterLink],
  template: `
    <div class="min-h-screen bg-background flex items-center justify-center px-4 py-8 font-sans">
      <div class="bg-card text-card-foreground rounded-lg p-8 w-full max-w-2xl border border-border">
        <div class="mb-6">
          <h1 class="text-2xl font-bold text-foreground">Verify domain ownership</h1>
          <p class="mt-2 text-sm text-muted-foreground">
            Add the following DNS record to <span class="font-mono font-medium">{{ domain() }}</span>
            to prove your workspace owns the domain.
          </p>
        </div>

        <div class="border border-border rounded-lg p-5 bg-muted/20 space-y-4 font-mono text-sm mb-6">
          <div class="grid grid-cols-[80px_1fr] gap-3 items-start">
            <span class="text-muted-foreground">Type</span>
            <span>TXT</span>
          </div>
          <div class="grid grid-cols-[80px_1fr] gap-3 items-start">
            <span class="text-muted-foreground">Host</span>
            <code class="select-all" data-testid="txt-host">{{ host() }}</code>
          </div>
          <div class="grid grid-cols-[80px_1fr] gap-3 items-start">
            <span class="text-muted-foreground">Value</span>
            <code class="select-all break-all" data-testid="txt-value">{{ value() }}</code>
          </div>
        </div>

        <p class="text-xs text-muted-foreground mb-6">
          DNS propagation can take a few minutes to up to 24 hours. We'll keep
          checking in the background every 10 minutes, or click below to check now.
        </p>

        @if (status() === 'waiting' || status() === 'still_pending') {
          <button
            type="button"
            (click)="onCheck()"
            [disabled]="!domainId() || !tenantId()"
            data-testid="verify-check"
            class="bg-primary text-primary-foreground rounded-md px-4 py-3 w-full font-medium hover:opacity-90 disabled:opacity-50 cursor-pointer"
          >
            Verify now
          </button>
        } @else if (status() === 'checking') {
          <button
            type="button"
            disabled
            class="bg-primary text-primary-foreground rounded-md px-4 py-3 w-full font-medium opacity-50 cursor-not-allowed"
          >
            Checking DNS…
          </button>
        } @else if (status() === 'verified') {
          <div
            class="rounded-md bg-success/10 px-4 py-3 text-sm text-success-foreground"
            data-testid="verify-success"
          >
            <strong>Domain verified ✓</strong> You can now sign in and invite teammates.
          </div>
          <a routerLink="/login" class="mt-4 inline-block text-primary font-medium hover:underline">
            Go to sign-in →
          </a>
        } @else if (status() === 'error') {
          <div class="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive" data-testid="verify-error">
            {{ store.error() || 'Something went wrong. Try again in a minute.' }}
          </div>
          <button
            type="button"
            (click)="onCheck()"
            class="mt-3 text-primary text-sm hover:underline cursor-pointer"
          >
            Try again
          </button>
        }

        @if (status() === 'still_pending') {
          <p class="mt-4 text-xs text-muted-foreground" data-testid="verify-still-pending">
            TXT record not found yet. DNS often takes 5–30 minutes; sometimes longer.
            This page will still work if you come back later.
          </p>
        }

        <p class="mt-8 text-xs text-muted-foreground">
          Need help? Common gotchas:
        </p>
        <ul class="list-disc list-inside text-xs text-muted-foreground mt-1 space-y-1">
          <li>Some providers append your domain automatically — enter just <code class="font-mono">_wave-connect-verify</code> as the host.</li>
          <li>Quotes around the value are fine — most providers strip them.</li>
          <li>Low TTL (60s) speeds propagation while you're testing.</li>
        </ul>
      </div>
    </div>
  `,
})
export class VerifyDomainComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  readonly store = inject(AuthStore);

  readonly domain = signal('');
  readonly host = signal('');
  readonly value = signal('');
  readonly domainId = signal('');
  readonly tenantId = signal('');

  readonly status = signal<'waiting' | 'checking' | 'verified' | 'still_pending' | 'error'>('waiting');

  ngOnInit(): void {
    const p = this.route.snapshot.queryParamMap;
    this.domain.set(p.get('domain') ?? '');
    this.host.set(p.get('host') ?? '');
    this.value.set(p.get('value') ?? '');
    this.domainId.set(p.get('domainId') ?? '');
    this.tenantId.set(p.get('tenantId') ?? '');
  }

  async onCheck(): Promise<void> {
    if (!this.domainId() || !this.tenantId()) return;
    this.status.set('checking');
    const outcome = await this.store.verifyDomain(this.tenantId(), this.domainId());
    switch (outcome) {
      case 'verified':
        this.status.set('verified');
        break;
      case 'pending':
        this.status.set('still_pending');
        break;
      case 'expired':
      case 'conflict':
      case 'already_done':
        this.status.set('error');
        break;
      default:
        this.status.set('error');
    }
  }
}
