import { Component, inject, signal, effect } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { FormsModule } from '@angular/forms';
import { ToggleSwitch } from 'primeng/toggleswitch';
import { MultiSelect } from 'primeng/multiselect';
import { PoliciesStore } from './policies.store';

@Component({
  selector: 'app-policies',
  standalone: true,
  imports: [NgIcon, FormsModule, ToggleSwitch, MultiSelect],
  providers: [PoliciesStore],
  template: `
    <div class="space-y-6">
      <div>
        <h2 class="text-2xl font-bold text-foreground">Security Policies</h2>
        <p class="text-sm text-muted-foreground mt-1">Configure security settings for your tenant</p>
      </div>

      @if (store.loading()) {
        <div class="space-y-6">
          @for (i of [1,2,3]; track i) {
            <div class="rounded-xl border border-border bg-card p-6 shadow-sm">
              <div class="h-6 w-40 rounded bg-muted/50 animate-pulse mb-4"></div>
              <div class="grid gap-4 sm:grid-cols-2">
                <div class="h-10 rounded bg-muted/50 animate-pulse"></div>
                <div class="h-10 rounded bg-muted/50 animate-pulse"></div>
              </div>
            </div>
          }
        </div>
      } @else {
        <div class="grid gap-6">
          <!-- Password Policy -->
          <div class="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h3 class="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
              <ng-icon name="heroKey" size="1.125rem" class="text-muted-foreground" />
              Password Policy
            </h3>
            <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label class="block text-sm font-medium text-muted-foreground mb-1.5">Minimum Length</label>
                <input type="number" [(ngModel)]="passwordMinLength" min="8" max="128"
                  class="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-colors" />
              </div>
              <div>
                <label class="block text-sm font-medium text-muted-foreground mb-1.5">History Count</label>
                <input type="number" [(ngModel)]="passwordHistoryCount" min="0" max="24"
                  class="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-colors" />
              </div>
              <div>
                <label class="block text-sm font-medium text-muted-foreground mb-1.5">Lockout Threshold</label>
                <input type="number" [(ngModel)]="lockoutThreshold" min="3" max="20"
                  class="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-colors" />
              </div>
            </div>
            <div class="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4 mt-4">
              <label class="flex items-center gap-2.5 text-sm text-foreground cursor-pointer">
                <p-toggleSwitch [(ngModel)]="passwordRequireUpper" />
                Require uppercase
              </label>
              <label class="flex items-center gap-2.5 text-sm text-foreground cursor-pointer">
                <p-toggleSwitch [(ngModel)]="passwordRequireLower" />
                Require lowercase
              </label>
              <label class="flex items-center gap-2.5 text-sm text-foreground cursor-pointer">
                <p-toggleSwitch [(ngModel)]="passwordRequireNumber" />
                Require number
              </label>
              <label class="flex items-center gap-2.5 text-sm text-foreground cursor-pointer">
                <p-toggleSwitch [(ngModel)]="passwordRequireSymbol" />
                Require symbol
              </label>
            </div>
          </div>

          <!-- MFA Policy -->
          <div class="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h3 class="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
              <ng-icon name="heroShieldCheck" size="1.125rem" class="text-muted-foreground" />
              MFA Policy
            </h3>
            <div class="space-y-4">
              <label class="flex items-center gap-2.5 text-sm text-foreground cursor-pointer">
                <p-toggleSwitch [(ngModel)]="passwordRequireMfa" />
                Require MFA for all users
              </label>
              <div>
                <label class="block text-sm font-medium text-muted-foreground mb-1.5">Allowed MFA Methods</label>
                <p-multiSelect
                  [options]="mfaMethodOptions"
                  [(ngModel)]="allowedMfaMethods"
                  placeholder="Select methods"
                  [style]="{ width: '100%' }"
                />
              </div>
            </div>
          </div>

          <!-- Session Policy -->
          <div class="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h3 class="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
              <ng-icon name="heroGlobeAlt" size="1.125rem" class="text-muted-foreground" />
              Session Policy
            </h3>
            <div class="grid gap-4 sm:grid-cols-3">
              <div>
                <label class="block text-sm font-medium text-muted-foreground mb-1.5">Max Session Age (hours)</label>
                <input type="number" [(ngModel)]="sessionMaxAgeHours" min="1" max="720"
                  class="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-colors" />
              </div>
              <div>
                <label class="block text-sm font-medium text-muted-foreground mb-1.5">Idle Timeout (minutes)</label>
                <input type="number" [(ngModel)]="idleTimeoutMinutes" min="5" max="1440"
                  class="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-colors" />
              </div>
              <div>
                <label class="block text-sm font-medium text-muted-foreground mb-1.5">Max Sessions per User</label>
                <input type="number" [(ngModel)]="maxSessionsPerUser" min="1" max="100"
                  class="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-colors" />
              </div>
            </div>
          </div>

          <!-- Access Control -->
          <div class="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h3 class="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
              <ng-icon name="heroBolt" size="1.125rem" class="text-muted-foreground" />
              Access Control
            </h3>
            <div class="space-y-4">
              <label class="flex items-center gap-2.5 text-sm text-foreground cursor-pointer">
                <p-toggleSwitch [(ngModel)]="requireSso" />
                Require SSO for all logins
              </label>
              <div>
                <label class="block text-sm font-medium text-muted-foreground mb-1.5">Allowed Email Domains</label>
                <input type="text" [(ngModel)]="emailDomainsInput" placeholder="Press Enter to add domain"
                  (keyup.enter)="addEmailDomain()"
                  class="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-colors" />
                <div class="flex flex-wrap gap-1.5 mt-2">
                  @for (domain of allowedEmailDomains(); track domain) {
                    <span class="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs text-foreground">
                      {{ domain }}
                      <button (click)="removeEmailDomain(domain)" class="text-muted-foreground hover:text-foreground">
                        <ng-icon name="heroXMark" size="0.75rem" />
                      </button>
                    </span>
                  }
                </div>
              </div>
              <div>
                <label class="block text-sm font-medium text-muted-foreground mb-1.5">IP Allowlist (CIDR)</label>
                <input type="text" [(ngModel)]="ipInput" placeholder="Press Enter to add CIDR"
                  (keyup.enter)="addIp()"
                  class="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-colors" />
                <div class="flex flex-wrap gap-1.5 mt-2">
                  @for (ip of ipAllowlist(); track ip) {
                    <span class="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-mono text-foreground">
                      {{ ip }}
                      <button (click)="removeIp(ip)" class="text-muted-foreground hover:text-foreground">
                        <ng-icon name="heroXMark" size="0.75rem" />
                      </button>
                    </span>
                  }
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Save Button -->
        <div class="flex items-center gap-3 pt-2">
          <button (click)="onSave()" [disabled]="store.saving()"
            class="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
            @if (store.saving()) {
              <div class="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground"></div>
            }
            Save Policies
          </button>
        </div>
      }
    </div>
  `,
})
export class PoliciesComponent {
  readonly store = inject(PoliciesStore);

  // Form fields bound to signals
  passwordMinLength = signal(8);
  passwordHistoryCount = signal(0);
  lockoutThreshold = signal(5);
  passwordRequireUpper = signal(false);
  passwordRequireLower = signal(false);
  passwordRequireNumber = signal(false);
  passwordRequireSymbol = signal(false);
  passwordRequireMfa = signal(false);
  allowedMfaMethods = signal<string[]>([]);
  sessionMaxAgeHours = signal(24);
  idleTimeoutMinutes = signal(30);
  maxSessionsPerUser = signal(5);
  requireSso = signal(false);
  allowedEmailDomains = signal<string[]>([]);
  ipAllowlist = signal<string[]>([]);

  emailDomainsInput = signal('');
  ipInput = signal('');

  mfaMethodOptions = [
    { label: 'TOTP', value: 'totp' },
    { label: 'WebAuthn', value: 'webauthn' },
    { label: 'SMS', value: 'sms' },
    { label: 'Email', value: 'email' },
    { label: 'Backup Codes', value: 'backup_code' },
  ];

  constructor() {
    // Sync policy data to form when loaded
    effect(() => {
      const p = this.store.policy();
      if (p) {
        this.passwordMinLength.set(p.passwordMinLength);
        this.passwordHistoryCount.set(p.passwordHistoryCount);
        this.lockoutThreshold.set(p.lockoutThreshold);
        this.passwordRequireUpper.set(p.passwordRequireUpper);
        this.passwordRequireLower.set(p.passwordRequireLower);
        this.passwordRequireNumber.set(p.passwordRequireNumber);
        this.passwordRequireSymbol.set(p.passwordRequireSymbol);
        this.passwordRequireMfa.set(p.passwordRequireMfa);
        this.allowedMfaMethods.set([...p.allowedMfaMethods]);
        this.sessionMaxAgeHours.set(p.sessionMaxAgeHours);
        this.idleTimeoutMinutes.set(p.idleTimeoutMinutes);
        this.maxSessionsPerUser.set(p.maxSessionsPerUser);
        this.requireSso.set(p.requireSso);
        this.allowedEmailDomains.set([...p.allowedEmailDomains]);
        this.ipAllowlist.set([...p.ipAllowlist]);
      }
    });
  }

  addEmailDomain() {
    const v = this.emailDomainsInput().trim();
    if (v && !this.allowedEmailDomains().includes(v)) {
      this.allowedEmailDomains.update((d) => [...d, v]);
    }
    this.emailDomainsInput.set('');
  }

  removeEmailDomain(domain: string) {
    this.allowedEmailDomains.update((d) => d.filter((x) => x !== domain));
  }

  addIp() {
    const v = this.ipInput().trim();
    if (v && !this.ipAllowlist().includes(v)) {
      this.ipAllowlist.update((d) => [...d, v]);
    }
    this.ipInput.set('');
  }

  removeIp(ip: string) {
    this.ipAllowlist.update((d) => d.filter((x) => x !== ip));
  }

  onSave() {
    this.store.savePolicy({
      passwordMinLength: this.passwordMinLength(),
      passwordHistoryCount: this.passwordHistoryCount(),
      lockoutThreshold: this.lockoutThreshold(),
      passwordRequireUpper: this.passwordRequireUpper(),
      passwordRequireLower: this.passwordRequireLower(),
      passwordRequireNumber: this.passwordRequireNumber(),
      passwordRequireSymbol: this.passwordRequireSymbol(),
      passwordRequireMfa: this.passwordRequireMfa(),
      allowedMfaMethods: this.allowedMfaMethods(),
      sessionMaxAgeHours: this.sessionMaxAgeHours(),
      idleTimeoutMinutes: this.idleTimeoutMinutes(),
      maxSessionsPerUser: this.maxSessionsPerUser(),
      requireSso: this.requireSso(),
      allowedEmailDomains: this.allowedEmailDomains(),
      ipAllowlist: this.ipAllowlist(),
    });
  }
}
