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
    <div class="flex min-h-screen bg-background text-foreground">
      <!-- Sidebar — light cream panel, 240px, border-right -->
      <aside
        class="sticky top-0 flex h-screen shrink-0 flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-150"
        [class.w-60]="!collapsed()"
        [class.w-16]="collapsed()"
      >
        <!-- Logo -->
        <div
          class="flex h-14 items-center gap-2 border-b border-sidebar-border px-4"
          [class.justify-center]="collapsed()"
          [class.px-3]="collapsed()"
        >
          @if (collapsed()) {
            <img src="logo-mark.svg" alt="Wave Connect" class="h-7 w-7 shrink-0" />
          } @else {
            <img src="logo-mark.svg" alt="" class="h-7 w-7 shrink-0" />
            <span class="text-[15px] font-semibold tracking-tight text-sidebar-foreground">
              wave<span class="wc-dot">·</span>connect
            </span>
          }
        </div>

        <!-- Tenant switcher chip -->
        @if (!collapsed()) {
          <button
            type="button"
            class="mx-3 mt-3 flex items-center gap-2.5 rounded-md border border-sidebar-border bg-sidebar-accent/60 px-2.5 py-2 text-left transition-colors hover:bg-sidebar-accent"
            title="Switch tenant"
          >
            <div class="flex h-6 w-6 shrink-0 items-center justify-center rounded-[5px] bg-primary text-[11px] font-semibold text-primary-foreground">
              A
            </div>
            <div class="min-w-0 flex-1 leading-tight">
              <div class="truncate text-[13px] font-medium text-sidebar-foreground">Acme Inc.</div>
              <div class="truncate font-mono text-[10px] text-sidebar-muted">acme.test</div>
            </div>
            <ng-icon name="heroChevronUpDown" class="shrink-0 text-sidebar-muted" size="0.8rem" />
          </button>
        }

        <!-- Navigation -->
        <nav class="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
          @for (item of navItems; track item.path) {
            <a
              [routerLink]="item.path"
              routerLinkActive="!bg-sidebar-accent !text-sidebar-accent-foreground font-medium"
              [ariaCurrentWhenActive]="'page'"
              class="flex items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-[13px] text-sidebar-muted transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
              [class.justify-center]="collapsed()"
              [class.px-0]="collapsed()"
              [title]="collapsed() ? item.label : null"
            >
              <ng-icon [name]="item.icon" class="shrink-0" size="0.95rem" />
              @if (!collapsed()) {
                <span>{{ item.label }}</span>
              }
            </a>
          }
        </nav>

        <!-- Footer: user chip + collapse -->
        <div class="border-t border-sidebar-border p-3">
          <div
            class="flex items-center gap-2.5 rounded-md px-1.5 py-1"
            [class.justify-center]="collapsed()"
          >
            <div
              class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground"
            >
              TA
            </div>
            @if (!collapsed()) {
              <div class="min-w-0 flex-1 leading-tight">
                <div class="truncate text-[12px] font-medium text-sidebar-foreground">Taylor Admin</div>
                <div class="truncate text-[11px] text-sidebar-muted">Owner</div>
              </div>
              <button
                (click)="logout()"
                class="rounded-sm p-1.5 text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
                title="Sign out"
                aria-label="Sign out"
              >
                <ng-icon name="heroArrowRightStartOnRectangle" size="0.85rem" />
              </button>
            }
          </div>
          <button
            (click)="collapsed.set(!collapsed())"
            class="mt-2 flex w-full items-center justify-center rounded-sm p-1.5 text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
            [title]="collapsed() ? 'Expand sidebar' : 'Collapse sidebar'"
            [attr.aria-label]="collapsed() ? 'Expand sidebar' : 'Collapse sidebar'"
          >
            <ng-icon [name]="collapsed() ? 'heroChevronRight' : 'heroChevronLeft'" size="0.8rem" />
          </button>
        </div>
      </aside>

      <!-- Main Content -->
      <div class="flex min-w-0 flex-1 flex-col">
        <!-- Top Bar — sticky, translucent cream, search + status -->
        <header class="sticky top-0 z-10 flex h-[52px] shrink-0 items-center gap-3.5 border-b border-border bg-background/80 px-6 backdrop-blur-sm">
          <div class="relative max-w-[400px] flex-1">
            <ng-icon
              name="heroMagnifyingGlass"
              class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              size="0.85rem"
            />
            <input
              type="search"
              placeholder="Search members, domains, audit events…"
              class="h-8 w-full rounded-md border border-border bg-muted pl-8 pr-12 text-[13px] text-foreground placeholder:text-muted-foreground focus:border-ring focus:bg-card focus:outline-none focus:ring-2 focus:ring-ring/35"
            />
            <span class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              ⌘K
            </span>
          </div>
          <div class="flex-1"></div>
          <span class="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[12px] font-medium text-foreground">
            <span class="h-1.5 w-1.5 rounded-full bg-[color:var(--wc-success)]"></span>
            All systems normal
          </span>
          <button
            (click)="toggleDarkMode()"
            class="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            [title]="isDark() ? 'Switch to light mode' : 'Switch to dark mode'"
            [attr.aria-label]="isDark() ? 'Switch to light mode' : 'Switch to dark mode'"
          >
            <ng-icon [name]="isDark() ? 'heroSun' : 'heroMoon'" size="0.95rem" />
          </button>
        </header>

        <!-- Page Content — 1200px inner cap, 24/32 padding -->
        <main class="flex-1">
          <div class="mx-auto max-w-[1200px] px-6 py-6 md:px-8 md:py-8">
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
    { path: 'dashboard', label: 'Overview', icon: 'heroHome' },
    { path: 'users', label: 'Members', icon: 'heroUsers' },
    { path: 'groups', label: 'Groups', icon: 'heroUserGroup' },
    { path: 'policies', label: 'Policies', icon: 'heroShieldCheck' },
    { path: 'webhooks', label: 'Webhooks', icon: 'heroBolt' },
    { path: 'audit', label: 'Audit log', icon: 'heroClipboardDocumentList' },
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
