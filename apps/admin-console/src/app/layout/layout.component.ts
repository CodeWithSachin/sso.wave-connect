import { Component, inject, signal } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { NgIcon } from '@ng-icons/core';
import { Toast } from 'primeng/toast';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { MessageService } from 'primeng/api';
import { ConfirmationService } from 'primeng/api';
import { firstValueFrom } from 'rxjs';
import { environment } from '../environments/environment';

interface NavItem {
  path: string;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NgIcon, Toast, ConfirmDialog],
  providers: [MessageService, ConfirmationService],
  template: `
    <div class="flex h-screen overflow-hidden bg-background">
      <!-- Sidebar -->
      <aside
        class="flex flex-col border-r border-sidebar-border bg-sidebar transition-all duration-200 shrink-0"
        [class.w-64]="!collapsed()"
        [class.w-16]="collapsed()"
      >
        <!-- Logo -->
        <div class="flex h-14 items-center gap-3 border-b border-sidebar-border px-4">
          <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm shrink-0">
            W
          </div>
          @if (!collapsed()) {
            <span class="text-sm font-semibold text-sidebar-foreground truncate">WaveConnect</span>
          }
        </div>

        <!-- Navigation -->
        <nav class="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
          @for (item of navItems; track item.path) {
            <a
              [routerLink]="item.path"
              routerLinkActive="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
              class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
              [class.justify-center]="collapsed()"
              [class.px-0]="collapsed()"
            >
              <ng-icon [name]="item.icon" class="shrink-0" size="1.25rem" />
              @if (!collapsed()) {
                <span>{{ item.label }}</span>
              }
            </a>
          }
        </nav>

        <!-- Collapse toggle -->
        <div class="border-t border-sidebar-border p-2">
          <button
            (click)="collapsed.set(!collapsed())"
            class="flex w-full items-center justify-center rounded-lg p-2 text-sidebar-muted hover:bg-sidebar-accent/50 transition-colors"
            [title]="collapsed() ? 'Expand sidebar' : 'Collapse sidebar'"
          >
            <ng-icon [name]="collapsed() ? 'heroChevronRight' : 'heroChevronLeft'" size="1rem" />
          </button>
        </div>
      </aside>

      <!-- Main Content -->
      <div class="flex flex-1 flex-col overflow-hidden">
        <!-- Top Bar -->
        <header class="flex h-14 items-center justify-between border-b border-border bg-card px-6 shrink-0">
          <div class="flex items-center gap-3">
            <button
              (click)="collapsed.set(!collapsed())"
              class="rounded-lg p-1.5 text-muted-foreground hover:bg-muted/50 transition-colors lg:hidden"
            >
              <ng-icon name="heroBars3" size="1.25rem" />
            </button>
            <h1 class="text-base font-semibold text-foreground">Admin Console</h1>
          </div>
          <div class="flex items-center gap-2">
            <button
              (click)="toggleDarkMode()"
              class="rounded-lg p-2 text-muted-foreground hover:bg-muted/50 transition-colors"
              [title]="isDark() ? 'Switch to light mode' : 'Switch to dark mode'"
            >
              <ng-icon [name]="isDark() ? 'heroSun' : 'heroMoon'" size="1.125rem" />
            </button>
            <div class="h-6 w-px bg-border"></div>
            <div class="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">
              A
            </div>
            <button
              (click)="logout()"
              class="rounded-lg p-2 text-muted-foreground hover:bg-muted/50 transition-colors"
              title="Sign out"
              aria-label="Sign out"
            >
              <ng-icon name="heroArrowRightStartOnRectangle" size="1.125rem" />
            </button>
          </div>
        </header>

        <!-- Page Content -->
        <main class="flex-1 overflow-y-auto bg-background">
          <div class="p-6">
            <router-outlet />
          </div>
        </main>
      </div>
    </div>

    <p-toast position="top-right" />
    <p-confirmDialog />
  `,
})
export class LayoutComponent {
  private readonly http = inject(HttpClient);

  collapsed = signal(false);
  isDark = signal(false);

  navItems: NavItem[] = [
    { path: 'dashboard', label: 'Dashboard', icon: 'heroHome' },
    { path: 'users', label: 'Users', icon: 'heroUsers' },
    { path: 'groups', label: 'Groups', icon: 'heroUserGroup' },
    { path: 'policies', label: 'Policies', icon: 'heroShieldCheck' },
    { path: 'webhooks', label: 'Webhooks', icon: 'heroBolt' },
    { path: 'audit', label: 'Audit Log', icon: 'heroClipboardDocumentList' },
    { path: 'scim', label: 'SCIM', icon: 'heroArrowPath' },
  ];

  toggleDarkMode() {
    this.isDark.update((v) => !v);
    document.documentElement.classList.toggle('dark');
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(
        this.http.post(
          `${environment.identityServiceUrl}/auth/logout`,
          {},
          { withCredentials: true },
        ),
      );
    } catch {
      // /auth/logout is idempotent and clears the cookie on any outcome;
      // swallow network/transport errors so we still drop local state.
    }
    sessionStorage.clear();
    window.location.href = '/';
  }
}
