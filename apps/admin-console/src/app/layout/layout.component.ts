import { Component, signal } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';

interface NavItem {
  path: string;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="flex h-screen overflow-hidden">
      <!-- Sidebar -->
      <aside
        class="flex flex-col border-r border-sidebar-border bg-sidebar transition-all duration-200"
        [class.w-64]="!collapsed()"
        [class.w-16]="collapsed()"
      >
        <!-- Logo -->
        <div class="flex h-16 items-center gap-3 border-b border-sidebar-border px-4">
          <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground font-bold text-sm">
            W
          </div>
          @if (!collapsed()) {
            <span class="text-sm font-semibold text-sidebar-foreground">WaveConnect</span>
          }
        </div>

        <!-- Navigation -->
        <nav class="flex-1 space-y-1 overflow-y-auto p-3">
          @for (item of navItems; track item.path) {
            <a
              [routerLink]="item.path"
              routerLinkActive="bg-sidebar-accent text-sidebar-accent-foreground"
              class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
              [class.justify-center]="collapsed()"
            >
              <span class="text-base">{{ item.icon }}</span>
              @if (!collapsed()) {
                <span>{{ item.label }}</span>
              }
            </a>
          }
        </nav>

        <!-- Collapse toggle -->
        <div class="border-t border-sidebar-border p-3">
          <button
            (click)="collapsed.set(!collapsed())"
            class="flex w-full items-center justify-center rounded-lg px-3 py-2 text-sm text-sidebar-muted hover:bg-sidebar-accent transition-colors"
          >
            {{ collapsed() ? '\u2192' : '\u2190' }}
          </button>
        </div>
      </aside>

      <!-- Main Content -->
      <div class="flex flex-1 flex-col overflow-hidden">
        <!-- Top Bar -->
        <header class="flex h-16 items-center justify-between border-b border-border bg-card px-6">
          <h1 class="text-lg font-semibold text-foreground">Admin Console</h1>
          <div class="flex items-center gap-4">
            <button
              (click)="toggleDarkMode()"
              class="rounded-lg p-2 text-muted-foreground hover:bg-accent transition-colors"
            >
              {{ isDark() ? '\u2600' : '\u263E' }}
            </button>
            <div class="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium">
              A
            </div>
          </div>
        </header>

        <!-- Page Content -->
        <main class="flex-1 overflow-y-auto p-6">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
})
export class LayoutComponent {
  collapsed = signal(false);
  isDark = signal(false);

  navItems: NavItem[] = [
    { path: 'dashboard', label: 'Dashboard', icon: '\u25A6' },
    { path: 'users', label: 'Users', icon: '\u263A' },
    { path: 'groups', label: 'Groups', icon: '\u2630' },
    { path: 'policies', label: 'Policies', icon: '\u2699' },
    { path: 'webhooks', label: 'Webhooks', icon: '\u21C4' },
    { path: 'audit', label: 'Audit Log', icon: '\u2637' },
    { path: 'scim', label: 'SCIM', icon: '\u21BB' },
  ];

  toggleDarkMode() {
    this.isDark.update((v) => !v);
    document.documentElement.classList.toggle('dark');
  }
}
