import { Component, signal } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="flex h-screen overflow-hidden">
      <aside class="flex flex-col border-r border-sidebar-border bg-sidebar w-64">
        <div class="flex h-16 items-center gap-3 border-b border-sidebar-border px-4">
          <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground font-bold text-sm">
            &lt;/&gt;
          </div>
          <span class="text-sm font-semibold text-sidebar-foreground">Developer Portal</span>
        </div>

        <nav class="flex-1 space-y-1 overflow-y-auto p-3">
          @for (item of navItems; track item.path) {
            <a
              [routerLink]="item.path"
              routerLinkActive="bg-sidebar-accent text-sidebar-accent-foreground"
              class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
            >
              <span class="text-base">{{ item.icon }}</span>
              <span>{{ item.label }}</span>
            </a>
          }
        </nav>
      </aside>

      <div class="flex flex-1 flex-col overflow-hidden">
        <header class="flex h-16 items-center justify-between border-b border-border bg-card px-6">
          <h1 class="text-lg font-semibold text-foreground">Developer Portal</h1>
          <div class="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium">
            D
          </div>
        </header>

        <main class="flex-1 overflow-y-auto p-6">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
})
export class LayoutComponent {
  navItems = [
    { path: 'dashboard', label: 'Dashboard', icon: '\u25A6' },
    { path: 'api-keys', label: 'API Keys', icon: '\u26BF' },
    { path: 'oauth-apps', label: 'OAuth Apps', icon: '\u2699' },
    { path: 'docs', label: 'Documentation', icon: '\u2637' },
    { path: 'scim', label: 'SCIM Tokens', icon: '\u21BB' },
  ];
}
