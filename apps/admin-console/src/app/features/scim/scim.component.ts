import { Component, inject } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { DatePipe } from '@angular/common';
import { ConfirmationService } from 'primeng/api';
import { ScimStore } from './scim.store';

@Component({
  selector: 'app-scim',
  standalone: true,
  imports: [NgIcon, DatePipe],
  providers: [ScimStore],
  template: `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-2xl font-bold text-foreground">SCIM Provisioning</h2>
          <p class="text-sm text-muted-foreground mt-1">Manage SCIM 2.0 tokens for IdP integration</p>
        </div>
        <button (click)="onGenerate()"
          class="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
          <ng-icon name="heroPlus" size="1rem" />
          Generate Token
        </button>
      </div>

      <!-- New Token Banner -->
      @if (store.newToken(); as token) {
        <div class="rounded-lg border border-success/30 bg-success/5 p-4">
          <div class="flex items-start gap-3">
            <ng-icon name="heroKey" size="1.25rem" class="text-success shrink-0 mt-0.5" />
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-foreground">SCIM token generated</p>
              <p class="text-xs text-muted-foreground mt-1">Copy this token now. It won't be shown again.</p>
              <div class="flex items-center gap-2 mt-2">
                <code class="rounded-md bg-muted px-3 py-1.5 text-xs font-mono text-foreground break-all">{{ token }}</code>
                <button (click)="copyToClipboard(token)"
                  class="rounded-lg p-1.5 text-muted-foreground hover:bg-muted/50 transition-colors shrink-0">
                  <ng-icon name="heroClipboard" size="1rem" />
                </button>
              </div>
            </div>
            <button (click)="store.dismissToken()"
              class="rounded-lg p-1 text-muted-foreground hover:bg-muted/50 transition-colors shrink-0">
              <ng-icon name="heroXMark" size="1rem" />
            </button>
          </div>
        </div>
      }

      <!-- Tokens Table -->
      <div class="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div class="px-4 py-3 border-b border-border">
          <h3 class="text-sm font-semibold text-foreground">SCIM Tokens</h3>
        </div>
        <table class="w-full text-left text-sm">
          <thead class="border-b border-border bg-muted/30">
            <tr>
              <th class="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Prefix</th>
              <th class="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Label</th>
              <th class="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Created</th>
              <th class="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Last Used</th>
              <th class="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Status</th>
              <th class="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider w-20">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            @if (store.loading()) {
              @for (i of [1,2]; track i) {
                <tr><td class="px-4 py-3" colspan="6"><div class="h-5 rounded bg-muted/50 animate-pulse"></div></td></tr>
              }
            } @else {
              @for (token of store.tokens(); track token.id) {
                <tr class="hover:bg-muted/20 transition-colors">
                  <td class="px-4 py-3 font-mono text-xs text-foreground">{{ token.tokenPrefix }}...</td>
                  <td class="px-4 py-3 text-sm text-foreground">{{ token.label ?? '—' }}</td>
                  <td class="px-4 py-3 text-sm text-muted-foreground">{{ token.createdAt | date:'mediumDate' }}</td>
                  <td class="px-4 py-3 text-sm text-muted-foreground">{{ token.lastUsedAt ? (token.lastUsedAt | date:'short') : 'Never' }}</td>
                  <td class="px-4 py-3">
                    <span class="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium"
                      [class]="token.isActive ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'">
                      {{ token.isActive ? 'Active' : 'Revoked' }}
                    </span>
                  </td>
                  <td class="px-4 py-3">
                    @if (token.isActive) {
                      <button (click)="confirmRevoke(token)"
                        class="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors" title="Revoke">
                        <ng-icon name="heroXMark" size="1rem" />
                      </button>
                    }
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="6" class="px-4 py-8 text-center text-muted-foreground text-sm">No SCIM tokens configured</td>
                </tr>
              }
            }
          </tbody>
        </table>
      </div>

      <!-- Sync Log -->
      <div class="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div class="px-4 py-3 border-b border-border">
          <h3 class="text-sm font-semibold text-foreground">Sync Log</h3>
        </div>
        <table class="w-full text-left text-sm">
          <thead class="border-b border-border bg-muted/30">
            <tr>
              <th class="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Timestamp</th>
              <th class="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Operation</th>
              <th class="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Resource</th>
              <th class="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            @for (log of store.syncLogs(); track log.id) {
              <tr class="hover:bg-muted/20 transition-colors">
                <td class="px-4 py-3 text-sm text-muted-foreground">{{ log.createdAt | date:'short' }}</td>
                <td class="px-4 py-3 text-sm text-foreground">{{ log.operation }}</td>
                <td class="px-4 py-3 text-sm text-foreground">{{ log.resourceType }} <span class="font-mono text-xs text-muted-foreground">{{ log.resourceId }}</span></td>
                <td class="px-4 py-3">
                  <span class="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium"
                    [class]="log.status === 'success' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'">
                    {{ log.status }}
                  </span>
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="4" class="px-4 py-8 text-center text-muted-foreground text-sm">No sync events recorded</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class ScimComponent {
  readonly store = inject(ScimStore);
  private confirmSvc = inject(ConfirmationService);

  onGenerate() {
    this.confirmSvc.confirm({
      message: 'Generate a new SCIM token? The token will only be shown once.',
      header: 'Generate Token',
      accept: () => this.store.generateToken(),
    });
  }

  confirmRevoke(token: { id: string; tokenPrefix: string }) {
    this.confirmSvc.confirm({
      message: `Revoke token ${token.tokenPrefix}...? This cannot be undone.`,
      header: 'Revoke Token',
      accept: () => this.store.revokeToken(token.id),
    });
  }

  copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
  }
}
