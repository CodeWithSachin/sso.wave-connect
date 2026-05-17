import { Component, computed, inject, signal } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Dialog } from 'primeng/dialog';
import { ConfirmationService } from 'primeng/api';
import { SearchService } from '../../core/search/search.service';
import type { ApiKey } from './api-keys.service';
import { ApiKeysStore } from './api-keys.store';

@Component({
  selector: 'app-api-keys',
  standalone: true,
  imports: [NgIcon, DatePipe, FormsModule, Dialog],
  providers: [ApiKeysStore],
  template: `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-2xl font-bold text-foreground">API Keys</h2>
          <p class="text-sm text-muted-foreground mt-1">Create and manage API keys for server-to-server authentication</p>
        </div>
        <button (click)="store.showDialog()"
          class="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
          <ng-icon name="heroPlus" size="1rem" />
          Create API Key
        </button>
      </div>

      <!-- New Key Banner -->
      @if (store.newKey(); as key) {
        <div class="rounded-lg border border-(--wc-success)/30 bg-(--wc-success)/5 p-4">
          <div class="flex items-start gap-3">
            <ng-icon name="heroKey" size="1.25rem" class="text-(--wc-success) shrink-0 mt-0.5" />
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-foreground">API key created successfully</p>
              <p class="text-xs text-muted-foreground mt-1">Copy this key now. It won't be shown again.</p>
              <div class="flex items-center gap-2 mt-2">
                <code class="rounded-md bg-muted px-3 py-1.5 text-xs font-mono text-foreground break-all">{{ key }}</code>
                <button (click)="copyToClipboard(key)"
                  class="rounded-lg p-1.5 text-muted-foreground hover:bg-muted/50 transition-colors shrink-0">
                  <ng-icon name="heroClipboard" size="1rem" />
                </button>
              </div>
            </div>
            <button (click)="store.dismissKey()"
              class="rounded-lg p-1 text-muted-foreground hover:bg-muted/50 transition-colors shrink-0">
              <ng-icon name="heroXMark" size="1rem" />
            </button>
          </div>
        </div>
      }

      <!-- Table -->
      <div class="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <table class="w-full text-left text-sm">
          <thead class="border-b border-border bg-muted/30">
            <tr>
              <th class="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Name</th>
              <th class="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Key Prefix</th>
              <th class="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Scopes</th>
              <th class="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Status</th>
              <th class="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Last Used</th>
              <th class="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider w-20">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            @if (store.loading()) {
              @for (i of [1,2,3]; track i) {
                <tr><td class="px-4 py-3" colspan="6"><div class="h-5 rounded bg-muted/50 animate-pulse"></div></td></tr>
              }
            } @else {
              @for (key of filteredKeys(); track key.id) {
                <tr class="hover:bg-muted/20 transition-colors">
                  <td class="px-4 py-3 font-medium text-foreground">{{ key.name }}</td>
                  <td class="px-4 py-3 font-mono text-xs text-muted-foreground">{{ key.keyPrefix }}...</td>
                  <td class="px-4 py-3">
                    <div class="flex flex-wrap gap-1">
                      @for (scope of (key.scopes ?? []).slice(0, 3); track scope) {
                        <span class="inline-flex rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{{ scope }}</span>
                      }
                    </div>
                  </td>
                  <td class="px-4 py-3">
                    <span class="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium"
                      [class]="key.status === 'active' ? 'bg-(--wc-success)/10 text-(--wc-success)' : 'bg-destructive/10 text-destructive'">
                      {{ key.status }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-sm text-muted-foreground">{{ key.lastUsedAt ? (key.lastUsedAt | date:'short') : 'Never' }}</td>
                  <td class="px-4 py-3">
                    @if (key.status === 'active') {
                      <button (click)="confirmRevoke(key)"
                        class="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors" title="Revoke">
                        <ng-icon name="heroXMark" size="1rem" />
                      </button>
                    }
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="6" class="px-4 py-12 text-center text-muted-foreground text-sm">
                    <ng-icon name="heroKey" size="2rem" class="mx-auto mb-3 opacity-40" />
                    <p>No API keys yet. Create one to get started.</p>
                  </td>
                </tr>
              }
            }
          </tbody>
        </table>
      </div>

      <!-- Create Dialog -->
      <p-dialog header="Create API Key" [visible]="store.dialogVisible()" (visibleChange)="$event ? null : store.hideDialog()" [modal]="true" [style]="{ width: '28rem' }">
        <div class="space-y-4 py-2">
          <div>
            <label class="block text-sm font-medium text-foreground mb-1.5">Name</label>
            <input type="text" [(ngModel)]="keyName" placeholder="My API Key"
              class="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-colors" />
          </div>
          <div>
            <label class="block text-sm font-medium text-foreground mb-1.5">Rate Limit (requests/min)</label>
            <input type="number" [(ngModel)]="rateLimit" placeholder="1000"
              class="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-colors" />
          </div>
          <div>
            <label class="block text-sm font-medium text-foreground mb-1.5">Expiration (optional)</label>
            <input type="date" [(ngModel)]="expiresAt"
              class="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-colors" />
          </div>
        </div>
        <ng-template #footer>
          <div class="flex items-center justify-end gap-3">
            <button (click)="store.hideDialog()"
              class="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors">Cancel</button>
            <button (click)="onCreate()" [disabled]="!keyName()"
              class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">Create</button>
          </div>
        </ng-template>
      </p-dialog>
    </div>
  `,
})
export class ApiKeysComponent {
  readonly store = inject(ApiKeysStore);
  private readonly search = inject(SearchService);
  private confirmSvc = inject(ConfirmationService);

  /**
   * Filtered view of the key list against the global search query. Matches
   * name, key prefix, or any scope. The empty-query case returns the
   * untouched list so the unfiltered render is the common path.
   */
  readonly filteredKeys = computed(() => {
    const q = this.search.query().toLowerCase();
    const keys = this.store.keys();
    if (!q) return keys;
    return keys.filter((k: ApiKey) =>
      k.name.toLowerCase().includes(q) ||
      k.keyPrefix.toLowerCase().includes(q) ||
      (k.scopes ?? []).some((s: string) => s.toLowerCase().includes(q)),
    );
  });

  keyName = signal('');
  rateLimit = signal<number | null>(null);
  expiresAt = signal('');

  onCreate() {
    if (!this.keyName()) return;
    this.store.createKey({
      name: this.keyName(),
      rate_limit_per_min: this.rateLimit() ?? undefined,
      expires_at: this.expiresAt() ? new Date(this.expiresAt()).toISOString() : undefined,
    });
    this.keyName.set('');
    this.rateLimit.set(null);
    this.expiresAt.set('');
  }

  confirmRevoke(key: { id: string; name: string }) {
    this.confirmSvc.confirm({
      message: `Revoke API key "${key.name}"? This cannot be undone.`,
      header: 'Revoke Key',
      accept: () => this.store.revokeKey(key.id),
    });
  }

  copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
  }
}
