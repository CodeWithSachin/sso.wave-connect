import { Component, inject, signal } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { FormsModule } from '@angular/forms';
import { Dialog } from 'primeng/dialog';
import { MultiSelect } from 'primeng/multiselect';
import { ConfirmationService } from 'primeng/api';
import { WebhooksStore } from './webhooks.store';
import { WEBHOOK_EVENT_TYPES } from './webhooks.service';

@Component({
  selector: 'app-webhooks',
  standalone: true,
  imports: [NgIcon, FormsModule, Dialog, MultiSelect],
  providers: [WebhooksStore],
  template: `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-2xl font-bold text-foreground">Webhooks</h2>
          <p class="text-sm text-muted-foreground mt-1">Configure endpoints for real-time event notifications</p>
        </div>
        <button (click)="store.showDialog()"
          class="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
          <ng-icon name="heroPlus" size="1rem" />
          Add Endpoint
        </button>
      </div>

      <!-- Secret Banner -->
      @if (store.newSecret(); as secret) {
        <div class="rounded-lg border border-success/30 bg-success/5 p-4">
          <div class="flex items-start gap-3">
            <ng-icon name="heroKey" size="1.25rem" class="text-success shrink-0 mt-0.5" />
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-foreground">Webhook signing secret created</p>
              <p class="text-xs text-muted-foreground mt-1">Copy this secret now. It won't be shown again.</p>
              <div class="flex items-center gap-2 mt-2">
                <code class="rounded-md bg-muted px-3 py-1.5 text-xs font-mono text-foreground break-all">{{ secret }}</code>
                <button (click)="copyToClipboard(secret)"
                  class="rounded-lg p-1.5 text-muted-foreground hover:bg-muted/50 transition-colors shrink-0">
                  <ng-icon name="heroClipboard" size="1rem" />
                </button>
              </div>
            </div>
            <button (click)="store.dismissSecret()"
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
              <th class="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">URL</th>
              <th class="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Events</th>
              <th class="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Status</th>
              <th class="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Failures</th>
              <th class="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider w-28">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            @if (store.loading()) {
              @for (i of [1,2]; track i) {
                <tr><td class="px-4 py-3" colspan="5"><div class="h-5 rounded bg-muted/50 animate-pulse"></div></td></tr>
              }
            } @else {
              @for (ep of store.endpoints(); track ep.id) {
                <tr class="hover:bg-muted/20 transition-colors">
                  <td class="px-4 py-3">
                    <p class="text-sm font-medium text-foreground truncate max-w-[300px]">{{ ep.url }}</p>
                    @if (ep.description) {
                      <p class="text-xs text-muted-foreground truncate">{{ ep.description }}</p>
                    }
                  </td>
                  <td class="px-4 py-3">
                    <div class="flex flex-wrap gap-1">
                      @for (evt of ep.subscribedEvents.slice(0, 2); track evt) {
                        <span class="inline-flex rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{{ evt }}</span>
                      }
                      @if (ep.subscribedEvents.length > 2) {
                        <span class="inline-flex rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">+{{ ep.subscribedEvents.length - 2 }}</span>
                      }
                    </div>
                  </td>
                  <td class="px-4 py-3">
                    <span class="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium"
                      [class]="ep.isActive ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'">
                      {{ ep.isActive ? 'Active' : 'Disabled' }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-sm" [class]="ep.failureCount > 0 ? 'text-destructive' : 'text-muted-foreground'">
                    {{ ep.failureCount }}
                  </td>
                  <td class="px-4 py-3">
                    <div class="flex items-center gap-1">
                      <button (click)="store.toggleActive(ep)"
                        class="rounded-lg p-1.5 text-muted-foreground hover:bg-muted/50 transition-colors"
                        [title]="ep.isActive ? 'Disable' : 'Enable'">
                        <ng-icon [name]="ep.isActive ? 'heroXMark' : 'heroCheck'" size="1rem" />
                      </button>
                      <button (click)="confirmDelete(ep)"
                        class="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors" title="Delete">
                        <ng-icon name="heroTrash" size="1rem" />
                      </button>
                    </div>
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="5" class="px-4 py-12 text-center text-muted-foreground text-sm">
                    <ng-icon name="heroBolt" size="2rem" class="mx-auto mb-3 opacity-40" />
                    <p>No webhook endpoints configured</p>
                  </td>
                </tr>
              }
            }
          </tbody>
        </table>
      </div>

      <!-- Create Dialog -->
      <p-dialog header="Add Webhook Endpoint" [visible]="store.dialogVisible()" (visibleChange)="$event ? null : store.hideDialog()" [modal]="true" [style]="{ width: '32rem' }">
        <div class="space-y-4 py-2">
          <div>
            <label class="block text-sm font-medium text-foreground mb-1.5">Endpoint URL</label>
            <input type="url" [(ngModel)]="webhookUrl" placeholder="https://example.com/webhook"
              class="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-colors" />
          </div>
          <div>
            <label class="block text-sm font-medium text-foreground mb-1.5">Description</label>
            <input type="text" [(ngModel)]="webhookDesc" placeholder="Optional description"
              class="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-colors" />
          </div>
          <div>
            <label class="block text-sm font-medium text-foreground mb-1.5">Subscribed Events</label>
            <p-multiSelect [options]="eventOptions" [(ngModel)]="webhookEvents" placeholder="Select events" [style]="{ width: '100%' }" />
          </div>
        </div>
        <ng-template #footer>
          <div class="flex items-center justify-end gap-3">
            <button (click)="store.hideDialog()"
              class="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors">Cancel</button>
            <button (click)="onCreate()" [disabled]="!webhookUrl() || webhookEvents().length === 0"
              class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">Create</button>
          </div>
        </ng-template>
      </p-dialog>
    </div>
  `,
})
export class WebhooksComponent {
  readonly store = inject(WebhooksStore);
  private confirmSvc = inject(ConfirmationService);

  webhookUrl = signal('');
  webhookDesc = signal('');
  webhookEvents = signal<string[]>([]);

  eventOptions = WEBHOOK_EVENT_TYPES.map((e) => ({ label: e, value: e }));

  onCreate() {
    this.store.createWebhook({
      url: this.webhookUrl(),
      description: this.webhookDesc() || undefined,
      subscribedEvents: this.webhookEvents(),
    });
    this.webhookUrl.set('');
    this.webhookDesc.set('');
    this.webhookEvents.set([]);
  }

  confirmDelete(ep: { id: string; url: string }) {
    this.confirmSvc.confirm({
      message: `Delete webhook endpoint "${ep.url}"?`,
      header: 'Confirm Delete',
      accept: () => this.store.deleteWebhook(ep.id),
    });
  }

  copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
  }
}
