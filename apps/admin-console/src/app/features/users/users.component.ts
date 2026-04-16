import { Component, inject, signal } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Dialog } from 'primeng/dialog';
import { ConfirmationService } from 'primeng/api';
import { UsersStore } from './users.store';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [NgIcon, DatePipe, FormsModule, Dialog],
  providers: [UsersStore],
  template: `
    <div class="space-y-6">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-2xl font-bold text-foreground">Users</h2>
          <p class="text-sm text-muted-foreground mt-1">Manage users in your tenant</p>
        </div>
        <button
          (click)="store.showDialog()"
          class="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <ng-icon name="heroUserPlus" size="1rem" />
          Invite User
        </button>
      </div>

      <!-- Search -->
      <div class="flex items-center gap-3">
        <div class="relative flex-1 max-w-sm">
          <ng-icon name="heroMagnifyingGlass" size="1rem" class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search users..."
            [(ngModel)]="searchTerm"
            class="w-full rounded-lg border border-border bg-input pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-colors"
          />
        </div>
      </div>

      <!-- Table -->
      <div class="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <table class="w-full text-left text-sm">
          <thead class="border-b border-border bg-muted/30">
            <tr>
              <th class="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">User</th>
              <th class="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Status</th>
              <th class="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Last Login</th>
              <th class="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Joined</th>
              <th class="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider w-24">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            @if (store.loading()) {
              @for (i of [1,2,3,4,5]; track i) {
                <tr>
                  <td class="px-4 py-3" colspan="5">
                    <div class="h-5 rounded bg-muted/50 animate-pulse"></div>
                  </td>
                </tr>
              }
            } @else {
              @for (user of store.users(); track user.id) {
                <tr class="hover:bg-muted/20 transition-colors">
                  <td class="px-4 py-3">
                    <div class="flex items-center gap-3">
                      <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">
                        {{ (user.displayName ?? user.email).charAt(0).toUpperCase() }}
                      </div>
                      <div class="min-w-0">
                        <p class="text-sm font-medium text-foreground truncate">{{ user.displayName ?? '—' }}</p>
                        <p class="text-xs text-muted-foreground truncate">{{ user.email }}</p>
                      </div>
                    </div>
                  </td>
                  <td class="px-4 py-3">
                    <span
                      class="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium"
                      [class]="getStatusClass(user.status)"
                    >
                      {{ user.status }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-sm text-muted-foreground">
                    {{ user.lastLoginAt ? (user.lastLoginAt | date:'short') : 'Never' }}
                  </td>
                  <td class="px-4 py-3 text-sm text-muted-foreground">
                    {{ user.createdAt | date:'mediumDate' }}
                  </td>
                  <td class="px-4 py-3">
                    <div class="flex items-center gap-1">
                      @if (user.status === 'active') {
                        <button
                          (click)="store.updateUserStatus(user, 'suspended')"
                          class="rounded-lg p-1.5 text-muted-foreground hover:bg-muted/50 transition-colors"
                          title="Suspend user"
                        >
                          <ng-icon name="heroXMark" size="1rem" />
                        </button>
                      } @else {
                        <button
                          (click)="store.updateUserStatus(user, 'active')"
                          class="rounded-lg p-1.5 text-muted-foreground hover:bg-muted/50 transition-colors"
                          title="Activate user"
                        >
                          <ng-icon name="heroCheck" size="1rem" />
                        </button>
                      }
                      <button
                        (click)="confirmDelete(user)"
                        class="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                        title="Remove user"
                      >
                        <ng-icon name="heroTrash" size="1rem" />
                      </button>
                    </div>
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="5" class="px-4 py-12 text-center text-muted-foreground text-sm">
                    <ng-icon name="heroUsers" size="2rem" class="mx-auto mb-3 opacity-40" />
                    <p>No users found</p>
                  </td>
                </tr>
              }
            }
          </tbody>
        </table>

        <!-- Pagination -->
        @if (store.total() > store.pageSize()) {
          <div class="flex items-center justify-between px-4 py-3 border-t border-border">
            <span class="text-sm text-muted-foreground">
              Showing {{ ((store.page() - 1) * store.pageSize()) + 1 }}–{{ Math.min(store.page() * store.pageSize(), store.total()) }} of {{ store.total() }}
            </span>
            <div class="flex items-center gap-1">
              <button
                [disabled]="store.page() === 1"
                (click)="store.loadUsers(store.page() - 1)"
                class="rounded-lg p-1.5 text-muted-foreground hover:bg-muted/50 disabled:opacity-40 transition-colors"
              >
                <ng-icon name="heroChevronLeft" size="1rem" />
              </button>
              <button
                [disabled]="store.page() * store.pageSize() >= store.total()"
                (click)="store.loadUsers(store.page() + 1)"
                class="rounded-lg p-1.5 text-muted-foreground hover:bg-muted/50 disabled:opacity-40 transition-colors"
              >
                <ng-icon name="heroChevronRight" size="1rem" />
              </button>
            </div>
          </div>
        }
      </div>

      <!-- Invite Dialog -->
      <p-dialog
        header="Invite User"
        [visible]="store.dialogVisible()"
        (visibleChange)="$event ? null : store.hideDialog()"
        [modal]="true"
        [style]="{ width: '28rem' }"
      >
        <div class="space-y-4 py-2">
          <div>
            <label class="block text-sm font-medium text-foreground mb-1.5">Email</label>
            <input
              type="email"
              [(ngModel)]="inviteEmail"
              placeholder="user&#64;example.com"
              class="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-colors"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-foreground mb-1.5">Display Name</label>
            <input
              type="text"
              [(ngModel)]="inviteName"
              placeholder="Jane Doe"
              class="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-colors"
            />
          </div>
        </div>
        <ng-template #footer>
          <div class="flex items-center justify-end gap-3">
            <button
              (click)="store.hideDialog()"
              class="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
            >
              Cancel
            </button>
            <button
              (click)="onInvite()"
              [disabled]="!inviteEmail()"
              class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              Send Invite
            </button>
          </div>
        </ng-template>
      </p-dialog>
    </div>
  `,
})
export class UsersComponent {
  readonly store = inject(UsersStore);
  private confirmSvc = inject(ConfirmationService);

  inviteEmail = signal('');
  inviteName = signal('');
  searchTerm = signal('');
  Math = Math;

  getStatusClass(status: string): string {
    switch (status) {
      case 'active': return 'bg-success/10 text-success';
      case 'suspended': return 'bg-destructive/10 text-destructive';
      case 'pending': return 'bg-warning/10 text-warning';
      default: return 'bg-muted text-muted-foreground';
    }
  }

  onInvite() {
    if (!this.inviteEmail()) return;
    this.store.createUser({
      email: this.inviteEmail(),
      displayName: this.inviteName() || undefined,
    });
    this.inviteEmail.set('');
    this.inviteName.set('');
  }

  confirmDelete(user: { id: string; email: string; version: number; displayName?: string; status: string; emailVerified: boolean; locale: string; timezone: string; createdAt: string; updatedAt: string }) {
    this.confirmSvc.confirm({
      message: `Are you sure you want to remove ${user.email}?`,
      header: 'Confirm Removal',
      acceptButtonStyleClass: 'bg-destructive text-destructive-foreground',
      accept: () => this.store.deleteUser(user),
    });
  }
}
