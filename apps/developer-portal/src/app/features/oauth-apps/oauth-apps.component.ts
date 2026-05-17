import { Component, computed, inject, signal } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Dialog } from 'primeng/dialog';
import { ConfirmationService } from 'primeng/api';
import { SearchService } from '../../core/search/search.service';
import { OAuthAppEditDialogComponent } from './oauth-app-edit.dialog';
import { OAuthAppsStore } from './oauth-apps.store';
import type { OAuthApp } from './oauth-apps.service';

@Component({
  selector: 'app-oauth-apps',
  standalone: true,
  imports: [NgIcon, DatePipe, FormsModule, Dialog, OAuthAppEditDialogComponent],
  providers: [OAuthAppsStore],
  template: `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-2xl font-bold text-foreground">OAuth Applications</h2>
          <p class="text-sm text-muted-foreground mt-1">Register and manage OAuth 2.0 applications</p>
        </div>
        <button (click)="store.showDialog()"
          class="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
          <ng-icon name="heroPlus" size="1rem" />
          Register App
        </button>
      </div>

      <!-- Credentials Banner -->
      @if (store.newCredentials(); as creds) {
        <div class="rounded-lg border border-(--wc-success)/30 bg-(--wc-success)/5 p-4">
          <div class="flex items-start gap-3">
            <ng-icon name="heroFingerPrint" size="1.25rem" class="text-(--wc-success) shrink-0 mt-0.5" />
            <div class="flex-1 min-w-0 space-y-2">
              <p class="text-sm font-medium text-foreground">OAuth credentials created</p>
              <p class="text-xs text-muted-foreground">Copy these credentials now. The client secret won't be shown again.</p>
              @if (creds.clientId) {
                <div>
                  <span class="text-xs text-muted-foreground">Client ID:</span>
                  <div class="flex items-center gap-2 mt-1">
                    <code class="rounded-md bg-muted px-3 py-1.5 text-xs font-mono text-foreground">{{ creds.clientId }}</code>
                    <button (click)="copyToClipboard(creds.clientId)"
                      class="rounded-lg p-1.5 text-muted-foreground hover:bg-muted/50 transition-colors shrink-0">
                      <ng-icon name="heroClipboard" size="1rem" />
                    </button>
                  </div>
                </div>
              }
              <div>
                <span class="text-xs text-muted-foreground">Client Secret:</span>
                <div class="flex items-center gap-2 mt-1">
                  <code class="rounded-md bg-muted px-3 py-1.5 text-xs font-mono text-foreground break-all">{{ creds.clientSecret }}</code>
                  <button (click)="copyToClipboard(creds.clientSecret)"
                    class="rounded-lg p-1.5 text-muted-foreground hover:bg-muted/50 transition-colors shrink-0">
                    <ng-icon name="heroClipboard" size="1rem" />
                  </button>
                </div>
              </div>
            </div>
            <button (click)="store.dismissCredentials()"
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
              <th class="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">App Name</th>
              <th class="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Client ID</th>
              <th class="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Redirect URIs</th>
              <th class="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Created</th>
              <th class="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider w-28">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            @if (store.loading()) {
              @for (i of [1,2]; track i) {
                <tr><td class="px-4 py-3" colspan="5"><div class="h-5 rounded bg-muted/50 animate-pulse"></div></td></tr>
              }
            } @else {
              @for (app of filteredApps(); track app.id) {
                <tr class="hover:bg-muted/20 transition-colors">
                  <td class="px-4 py-3 font-medium text-foreground">{{ app.name }}</td>
                  <td class="px-4 py-3">
                    <div class="flex items-center gap-1">
                      <code class="text-xs font-mono text-muted-foreground">{{ app.clientId }}</code>
                      <button (click)="copyToClipboard(app.clientId)"
                        class="rounded p-0.5 text-muted-foreground hover:bg-muted/50 transition-colors">
                        <ng-icon name="heroClipboard" size="0.75rem" />
                      </button>
                    </div>
                  </td>
                  <td class="px-4 py-3">
                    <div class="flex flex-wrap gap-1">
                      @for (uri of app.redirectUris.slice(0, 2); track uri) {
                        <span class="inline-flex rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground truncate max-w-[150px]">{{ uri }}</span>
                      }
                      @if (app.redirectUris.length > 2) {
                        <span class="text-[10px] text-muted-foreground">+{{ app.redirectUris.length - 2 }}</span>
                      }
                    </div>
                  </td>
                  <td class="px-4 py-3 text-sm text-muted-foreground">{{ app.createdAt | date:'mediumDate' }}</td>
                  <td class="px-4 py-3">
                    <div class="flex items-center gap-1">
                      <button (click)="store.openEdit(app)"
                        class="rounded-lg p-1.5 text-muted-foreground hover:bg-muted/50 transition-colors" title="Edit">
                        <ng-icon name="heroPencilSquare" size="1rem" />
                      </button>
                      <button (click)="confirmRotateSecret(app)"
                        class="rounded-lg p-1.5 text-muted-foreground hover:bg-muted/50 transition-colors" title="Rotate secret">
                        <ng-icon name="heroArrowPath" size="1rem" />
                      </button>
                      <button (click)="confirmDelete(app)"
                        class="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors" title="Delete">
                        <ng-icon name="heroTrash" size="1rem" />
                      </button>
                    </div>
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="5" class="px-4 py-12 text-center text-muted-foreground text-sm">
                    <ng-icon name="heroFingerPrint" size="2rem" class="mx-auto mb-3 opacity-40" />
                    <p>No OAuth applications registered yet</p>
                  </td>
                </tr>
              }
            }
          </tbody>
        </table>
      </div>

      <!-- Register Dialog -->
      <p-dialog header="Register OAuth App" [visible]="store.dialogVisible()" (visibleChange)="$event ? null : store.hideDialog()" [modal]="true" [style]="{ width: '32rem' }">
        <div class="space-y-4 py-2">
          <div>
            <label class="block text-sm font-medium text-foreground mb-1.5">Application Name</label>
            <input type="text" [(ngModel)]="appName" placeholder="My OAuth App"
              class="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-colors" />
          </div>
          <div>
            <label class="block text-sm font-medium text-foreground mb-1.5">Redirect URIs</label>
            <input type="text" [(ngModel)]="redirectUriInput" placeholder="https://example.com/callback — press Enter"
              (keyup.enter)="addRedirectUri()"
              class="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-colors" />
            <div class="flex flex-wrap gap-1.5 mt-2">
              @for (uri of redirectUris(); track uri) {
                <span class="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-mono text-foreground">
                  {{ uri }}
                  <button (click)="removeRedirectUri(uri)" class="text-muted-foreground hover:text-foreground">
                    <ng-icon name="heroXMark" size="0.75rem" />
                  </button>
                </span>
              }
            </div>
          </div>
        </div>
        <ng-template #footer>
          <div class="flex items-center justify-end gap-3">
            <button (click)="store.hideDialog()"
              class="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors">Cancel</button>
            <button (click)="onRegister()" [disabled]="!appName() || redirectUris().length === 0"
              class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">Register</button>
          </div>
        </ng-template>
      </p-dialog>

      <!-- Edit dialog (visibility driven by store.editing()) -->
      <app-oauth-app-edit-dialog />
    </div>
  `,
})
export class OAuthAppsComponent {
  readonly store = inject(OAuthAppsStore);
  private readonly search = inject(SearchService);
  private confirmSvc = inject(ConfirmationService);

  /**
   * Client-side filter driven by the global search input in the layout
   * header. Matches against name, client_id, or any redirect URI; empty
   * query returns the unfiltered list (no perf cost vs. .filter()).
   */
  readonly filteredApps = computed(() => {
    const q = this.search.query().toLowerCase();
    const apps = this.store.apps();
    if (!q) return apps;
    return apps.filter((app: OAuthApp) =>
      app.name.toLowerCase().includes(q) ||
      app.clientId.toLowerCase().includes(q) ||
      (app.redirectUris ?? []).some((u: string) => u.toLowerCase().includes(q)),
    );
  });

  appName = signal('');
  redirectUriInput = signal('');
  redirectUris = signal<string[]>([]);

  addRedirectUri() {
    const v = this.redirectUriInput().trim();
    if (v && !this.redirectUris().includes(v)) {
      this.redirectUris.update((uris) => [...uris, v]);
    }
    this.redirectUriInput.set('');
  }

  removeRedirectUri(uri: string) {
    this.redirectUris.update((uris) => uris.filter((u) => u !== uri));
  }

  onRegister() {
    if (!this.appName() || this.redirectUris().length === 0) return;
    this.store.createApp({
      name: this.appName(),
      redirect_uris: this.redirectUris(),
    });
    this.appName.set('');
    this.redirectUris.set([]);
  }

  confirmRotateSecret(app: { id: string; name: string }) {
    this.confirmSvc.confirm({
      message: `Rotate the client secret for "${app.name}"? The old secret will stop working immediately.`,
      header: 'Rotate Secret',
      accept: () => this.store.rotateSecret(app.id),
    });
  }

  confirmDelete(app: { id: string; name: string }) {
    this.confirmSvc.confirm({
      message: `Delete "${app.name}"? This cannot be undone.`,
      header: 'Delete App',
      accept: () => this.store.deleteApp(app.id),
    });
  }

  copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
  }
}
