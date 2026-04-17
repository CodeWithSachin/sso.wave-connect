import { Component, inject, signal } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuditStore } from './audit.store';

@Component({
  selector: 'app-audit',
  standalone: true,
  imports: [NgIcon, DatePipe, FormsModule],
  providers: [AuditStore],
  template: `
    <div class="space-y-6">
      <div>
        <h2 class="text-2xl font-bold text-foreground">Audit Log</h2>
        <p class="text-sm text-muted-foreground mt-1">Search and review security events</p>
      </div>

      <!-- Filters -->
      <div class="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div class="flex flex-wrap items-end gap-3">
          <div>
            <label class="block text-xs font-medium text-muted-foreground mb-1">Start Date</label>
            <input type="date" [(ngModel)]="startDate"
              class="rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-colors" />
          </div>
          <div>
            <label class="block text-xs font-medium text-muted-foreground mb-1">End Date</label>
            <input type="date" [(ngModel)]="endDate"
              class="rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-colors" />
          </div>
          <div>
            <label class="block text-xs font-medium text-muted-foreground mb-1">Action</label>
            <select [(ngModel)]="action"
              class="rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-colors">
              <option value="">All Actions</option>
              <option value="user.created">user.created</option>
              <option value="user.updated">user.updated</option>
              <option value="user.deleted">user.deleted</option>
              <option value="user.login">user.login</option>
              <option value="group.created">group.created</option>
              <option value="permission.granted">permission.granted</option>
              <option value="permission.revoked">permission.revoked</option>
              <option value="session.created">session.created</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-muted-foreground mb-1">Resource Type</label>
            <select [(ngModel)]="resourceType"
              class="rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-colors">
              <option value="">All Types</option>
              <option value="user">user</option>
              <option value="group">group</option>
              <option value="membership">membership</option>
              <option value="session">session</option>
              <option value="policy">policy</option>
            </select>
          </div>
          <div class="flex items-center gap-2">
            <button (click)="onSearch()"
              class="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
              <ng-icon name="heroMagnifyingGlass" size="1rem" />
              Search
            </button>
            <button (click)="onClear()"
              class="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors">
              Clear
            </button>
          </div>
        </div>
      </div>

      <!-- Table -->
      <div class="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <table class="w-full text-left text-sm">
          <thead class="border-b border-border bg-muted/30">
            <tr>
              <th class="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Timestamp</th>
              <th class="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Action</th>
              <th class="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Actor</th>
              <th class="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Resource</th>
              <th class="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">IP Address</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            @if (store.loading()) {
              @for (i of [1,2,3,4,5]; track i) {
                <tr><td class="px-4 py-3" colspan="5"><div class="h-5 rounded bg-muted/50 animate-pulse"></div></td></tr>
              }
            } @else if (store.events().length === 0) {
              <tr>
                <td colspan="5" class="px-4 py-12 text-center text-muted-foreground text-sm">
                  <ng-icon name="heroClipboardDocumentList" size="2rem" class="mx-auto mb-3 opacity-40" />
                  <p>{{ store.total() === 0 && !store.filters().startDate ? 'Select a date range and search to view audit logs' : 'No events match your filters' }}</p>
                </td>
              </tr>
            } @else {
              @for (event of store.events(); track event.id) {
                <tr class="hover:bg-muted/20 transition-colors">
                  <td class="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">{{ event.createdAt | date:'short' }}</td>
                  <td class="px-4 py-3">
                    <span class="inline-flex rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{{ event.action }}</span>
                  </td>
                  <td class="px-4 py-3 text-sm text-foreground">
                    <span class="font-mono text-xs">{{ event.actorId }}</span>
                    <span class="text-xs text-muted-foreground ml-1">({{ event.actorType }})</span>
                  </td>
                  <td class="px-4 py-3 text-sm text-foreground">
                    {{ event.resourceType }}
                    <span class="text-xs text-muted-foreground ml-1 font-mono">{{ event.resourceId }}</span>
                  </td>
                  <td class="px-4 py-3 text-sm text-muted-foreground font-mono">{{ event.actorIp }}</td>
                </tr>
              }
            }
          </tbody>
        </table>

        @if (store.total() > store.pageSize()) {
          <div class="flex items-center justify-between px-4 py-3 border-t border-border">
            <span class="text-sm text-muted-foreground">{{ store.total() }} events found</span>
            <div class="flex items-center gap-1">
              <button [disabled]="store.page() === 1" (click)="store.loadPage(store.page() - 1)"
                class="rounded-lg p-1.5 text-muted-foreground hover:bg-muted/50 disabled:opacity-40 transition-colors">
                <ng-icon name="heroChevronLeft" size="1rem" />
              </button>
              <span class="text-sm text-muted-foreground px-2">Page {{ store.page() }}</span>
              <button [disabled]="store.page() * store.pageSize() >= store.total()" (click)="store.loadPage(store.page() + 1)"
                class="rounded-lg p-1.5 text-muted-foreground hover:bg-muted/50 disabled:opacity-40 transition-colors">
                <ng-icon name="heroChevronRight" size="1rem" />
              </button>
            </div>
          </div>
        }
      </div>
    </div>
  `,
})
export class AuditComponent {
  readonly store = inject(AuditStore);

  startDate = signal('');
  endDate = signal('');
  action = signal('');
  resourceType = signal('');

  onSearch() {
    this.store.search({
      startDate: this.startDate() || undefined,
      endDate: this.endDate() || undefined,
      action: this.action() || undefined,
      resourceType: this.resourceType() || undefined,
    });
  }

  onClear() {
    this.startDate.set('');
    this.endDate.set('');
    this.action.set('');
    this.resourceType.set('');
    this.store.search({});
  }
}
