import { Component, inject, signal } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Dialog } from 'primeng/dialog';
import { ConfirmationService } from 'primeng/api';
import { GroupsStore } from './groups.store';

@Component({
  selector: 'app-groups',
  standalone: true,
  imports: [NgIcon, DatePipe, FormsModule, Dialog],
  providers: [GroupsStore],
  template: `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-2xl font-bold text-foreground">Groups</h2>
          <p class="text-sm text-muted-foreground mt-1">Manage groups and team memberships</p>
        </div>
        <button
          (click)="store.showCreateDialog()"
          class="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <ng-icon name="heroPlus" size="1rem" />
          Create Group
        </button>
      </div>

      <!-- Groups Table -->
      <div class="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <table class="w-full text-left text-sm">
          <thead class="border-b border-border bg-muted/30">
            <tr>
              <th class="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Name</th>
              <th class="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Slug</th>
              <th class="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Description</th>
              <th class="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Managed</th>
              <th class="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Created</th>
              <th class="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider w-28">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            @if (store.loading()) {
              @for (i of [1,2,3]; track i) {
                <tr><td class="px-4 py-3" colspan="6"><div class="h-5 rounded bg-muted/50 animate-pulse"></div></td></tr>
              }
            } @else {
              @for (group of store.groups(); track group.id) {
                <tr class="hover:bg-muted/20 transition-colors">
                  <td class="px-4 py-3 font-medium text-foreground">{{ group.name }}</td>
                  <td class="px-4 py-3 text-muted-foreground font-mono text-xs">{{ group.slug }}</td>
                  <td class="px-4 py-3 text-muted-foreground truncate max-w-[200px]">{{ group.description ?? '—' }}</td>
                  <td class="px-4 py-3">
                    <span class="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium"
                      [class]="group.isManaged ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'">
                      {{ group.isManaged ? 'Managed' : 'Manual' }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-sm text-muted-foreground">{{ group.createdAt | date:'mediumDate' }}</td>
                  <td class="px-4 py-3">
                    <div class="flex items-center gap-1">
                      <button (click)="store.viewMembers(group)"
                        class="rounded-lg p-1.5 text-muted-foreground hover:bg-muted/50 transition-colors" title="View members">
                        <ng-icon name="heroUsers" size="1rem" />
                      </button>
                      <button (click)="confirmDelete(group)"
                        class="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors" title="Delete group">
                        <ng-icon name="heroTrash" size="1rem" />
                      </button>
                    </div>
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="6" class="px-4 py-12 text-center text-muted-foreground text-sm">
                    <ng-icon name="heroUserGroup" size="2rem" class="mx-auto mb-3 opacity-40" />
                    <p>No groups yet</p>
                  </td>
                </tr>
              }
            }
          </tbody>
        </table>
      </div>

      <!-- Create Group Dialog -->
      <p-dialog header="Create Group" [visible]="store.createDialogVisible()" (visibleChange)="$event ? null : store.hideCreateDialog()" [modal]="true" [style]="{ width: '28rem' }">
        <div class="space-y-4 py-2">
          <div>
            <label class="block text-sm font-medium text-foreground mb-1.5">Group Name</label>
            <input type="text" [(ngModel)]="groupName" placeholder="Engineering"
              class="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-colors" />
          </div>
          <div>
            <label class="block text-sm font-medium text-foreground mb-1.5">Slug</label>
            <input type="text" [(ngModel)]="groupSlug" placeholder="engineering"
              class="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-colors" />
          </div>
          <div>
            <label class="block text-sm font-medium text-foreground mb-1.5">Description</label>
            <textarea [(ngModel)]="groupDesc" rows="2" placeholder="Optional description"
              class="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-colors resize-none"></textarea>
          </div>
        </div>
        <ng-template #footer>
          <div class="flex items-center justify-end gap-3">
            <button (click)="store.hideCreateDialog()"
              class="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors">Cancel</button>
            <button (click)="onCreate()" [disabled]="!groupName() || !groupSlug()"
              class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">Create</button>
          </div>
        </ng-template>
      </p-dialog>

      <!-- Members Dialog -->
      <p-dialog header="Group Members" [visible]="store.membersDialogVisible()" (visibleChange)="$event ? null : store.hideMembersDialog()" [modal]="true" [style]="{ width: '32rem' }">
        @if (store.selectedGroup(); as group) {
          <div class="space-y-3 py-2">
            <p class="text-sm text-muted-foreground">Members of <strong>{{ group.name }}</strong></p>
            @if (group.memberships && group.memberships.length > 0) {
              <div class="divide-y divide-border rounded-lg border border-border">
                @for (member of group.memberships; track member.id) {
                  <div class="flex items-center justify-between px-4 py-2.5">
                    <div>
                      <p class="text-sm font-medium text-foreground">{{ member.userId }}</p>
                      <p class="text-xs text-muted-foreground">{{ member.role }}</p>
                    </div>
                    <button (click)="store.removeMember(group.id, member.userId)"
                      class="rounded-lg p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                      <ng-icon name="heroXMark" size="1rem" />
                    </button>
                  </div>
                }
              </div>
            } @else {
              <p class="text-sm text-muted-foreground text-center py-6">No members in this group</p>
            }
          </div>
        }
        <ng-template #footer>
          <button (click)="store.hideMembersDialog()"
            class="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors">Close</button>
        </ng-template>
      </p-dialog>
    </div>
  `,
})
export class GroupsComponent {
  readonly store = inject(GroupsStore);
  private confirmSvc = inject(ConfirmationService);

  groupName = signal('');
  groupSlug = signal('');
  groupDesc = signal('');

  onCreate() {
    if (!this.groupName() || !this.groupSlug()) return;
    this.store.createGroup({
      name: this.groupName(),
      slug: this.groupSlug(),
      description: this.groupDesc() || undefined,
    });
    this.groupName.set('');
    this.groupSlug.set('');
    this.groupDesc.set('');
  }

  confirmDelete(group: { id: string; name: string; tenantId: string; slug: string; isManaged: boolean; version: number; createdAt: string; updatedAt: string }) {
    this.confirmSvc.confirm({
      message: `Are you sure you want to delete "${group.name}"?`,
      header: 'Confirm Delete',
      accept: () => this.store.deleteGroup(group),
    });
  }
}
