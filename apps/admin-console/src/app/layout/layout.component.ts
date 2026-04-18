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
    <div class="flex h-screen gap-4 overflow-hidden bg-background p-4 text-foreground">
      <!-- Sidebar — SnowUI dark rounded panel -->
      <aside
        class="flex shrink-0 flex-col rounded-[28px] bg-sidebar text-sidebar-foreground shadow-lg transition-[width] duration-200 ease-out"
        [class.w-64]="!collapsed()"
        [class.w-[84px]]="collapsed()"
      >
        <!-- Logo -->
        <div
          class="flex items-center gap-3 border-b border-sidebar-border px-5 py-6"
          [class.justify-center]="collapsed()"
          [class.px-3]="collapsed()"
        >
          <img src="snowui-mark.svg" alt="SnowUI" class="h-7 w-7 shrink-0" />
          @if (!collapsed()) {
            <div class="leading-tight">
              <div class="text-[15px] font-bold tracking-tight text-sidebar-foreground">WaveConnect</div>
              <div class="text-[11px] text-sidebar-muted">Admin Console</div>
            </div>
          }
        </div>

        <!-- Navigation -->
        <nav class="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          @if (!collapsed()) {
            <div class="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted">
              Workspace
            </div>
          }
          @for (item of navItems; track item.path) {
            <a
              [routerLink]="item.path"
              routerLinkActive="!bg-sidebar-accent !text-sidebar-accent-foreground"
              [ariaCurrentWhenActive]="'page'"
              class="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium text-sidebar-foreground/80 transition-colors hover:bg-white/5 hover:text-sidebar-foreground"
              [class.justify-center]="collapsed()"
              [class.px-0]="collapsed()"
              [title]="collapsed() ? item.label : null"
            >
              <ng-icon [name]="item.icon" class="shrink-0" size="1.15rem" />
              @if (!collapsed()) {
                <span>{{ item.label }}</span>
              }
            </a>
          }
        </nav>

        <!-- Footer: brand mark + collapse toggle -->
        <div class="border-t border-sidebar-border p-3">
          <div
            class="flex items-center gap-3 rounded-xl px-2 py-2"
            [class.justify-center]="collapsed()"
          >
            <div
              class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-[13px] font-semibold text-sidebar-primary-foreground"
            >
              A
            </div>
            @if (!collapsed()) {
              <div class="min-w-0 flex-1 leading-tight">
                <div class="truncate text-[13px] font-semibold text-sidebar-foreground">Administrator</div>
                <div class="truncate text-[11px] text-sidebar-muted">Signed in</div>
              </div>
              <button
                (click)="collapsed.set(true)"
                class="rounded-lg p-1.5 text-sidebar-muted transition-colors hover:bg-white/5 hover:text-sidebar-foreground"
                aria-label="Collapse sidebar"
              >
                <ng-icon name="heroChevronLeft" size="1rem" />
              </button>
            } @else {
              <button
                (click)="collapsed.set(false)"
                class="rounded-lg p-1.5 text-sidebar-muted transition-colors hover:bg-white/5 hover:text-sidebar-foreground"
                aria-label="Expand sidebar"
              >
                <ng-icon name="heroChevronRight" size="1rem" />
              </button>
            }
          </div>
        </div>
      </aside>

      <!-- Main Content -->
      <div class="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[28px] bg-card shadow-sm">
        <!-- Top Bar -->
        <header class="flex h-16 shrink-0 items-center justify-between border-b border-border px-6">
          <div class="flex items-center gap-3">
            <button
              (click)="collapsed.set(!collapsed())"
              class="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted lg:hidden"
              aria-label="Toggle sidebar"
            >
              <ng-icon name="heroBars3" size="1.25rem" />
            </button>
            <div class="leading-tight">
              <div class="text-[11px] uppercase tracking-wider text-muted-foreground">Admin</div>
              <h1 class="text-[15px] font-semibold text-foreground">Admin Console</h1>
            </div>
          </div>
          <div class="flex items-center gap-1.5">
            <button
              (click)="toggleDarkMode()"
              class="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted"
              [title]="isDark() ? 'Switch to light mode' : 'Switch to dark mode'"
              [attr.aria-label]="isDark() ? 'Switch to light mode' : 'Switch to dark mode'"
            >
              <ng-icon [name]="isDark() ? 'heroSun' : 'heroMoon'" size="1.125rem" />
            </button>
            <div class="mx-1 h-6 w-px bg-border"></div>
            <div class="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-[12px] font-semibold text-accent-foreground">
              A
            </div>
            <button
              (click)="logout()"
              class="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted"
              title="Sign out"
              aria-label="Sign out"
            >
              <ng-icon name="heroArrowRightStartOnRectangle" size="1.125rem" />
            </button>
          </div>
        </header>

        <!-- Page Content -->
        <main class="flex-1 overflow-y-auto">
          <div class="p-6 md:p-8">
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
