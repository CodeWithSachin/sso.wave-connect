import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { DashboardStore } from './dashboard.store';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, NgIcon],
  providers: [DashboardStore],
  template: `
    <div class="space-y-6">
      <div>
        <h2 class="text-2xl font-bold text-foreground">Developer Dashboard</h2>
        <p class="text-sm text-muted-foreground mt-1">Overview of your developer resources</p>
      </div>

      <!-- Stats Cards -->
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div class="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-muted-foreground">Active API Keys</span>
            <div class="rounded-lg bg-primary/10 p-2">
              <ng-icon name="heroKey" class="text-primary" size="1.25rem" />
            </div>
          </div>
          <div class="mt-3">
            @if (store.loading()) {
              <div class="h-8 w-16 rounded bg-muted/50 animate-pulse"></div>
            } @else {
              <p class="text-3xl font-bold text-foreground">{{ store.activeApiKeys() }}</p>
            }
          </div>
        </div>

        <div class="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-muted-foreground">OAuth Applications</span>
            <div class="rounded-lg bg-success/10 p-2">
              <ng-icon name="heroFingerPrint" class="text-success" size="1.25rem" />
            </div>
          </div>
          <div class="mt-3">
            @if (store.loading()) {
              <div class="h-8 w-16 rounded bg-muted/50 animate-pulse"></div>
            } @else {
              <p class="text-3xl font-bold text-foreground">{{ store.oauthAppCount() }}</p>
            }
          </div>
        </div>

        <div class="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-muted-foreground">API Requests (30d)</span>
            <div class="rounded-lg bg-warning/10 p-2">
              <ng-icon name="heroChartBar" class="text-warning" size="1.25rem" />
            </div>
          </div>
          <div class="mt-3">
            <p class="text-3xl font-bold text-foreground">—</p>
          </div>
        </div>
      </div>

      <!-- Quick Actions -->
      <div class="rounded-xl border border-border bg-card shadow-sm">
        <div class="px-6 py-4 border-b border-border">
          <h3 class="text-base font-semibold text-foreground">Quick Start</h3>
        </div>
        <div class="grid gap-3 sm:grid-cols-2 p-4">
          <a routerLink="/api-keys"
            class="flex items-center gap-4 rounded-lg border border-border p-4 hover:bg-muted/20 transition-colors">
            <div class="rounded-lg bg-primary/10 p-3">
              <ng-icon name="heroKey" size="1.5rem" class="text-primary" />
            </div>
            <div>
              <p class="font-medium text-foreground">Create an API Key</p>
              <p class="text-sm text-muted-foreground">Generate keys for server-to-server authentication</p>
            </div>
          </a>
          <a routerLink="/docs"
            class="flex items-center gap-4 rounded-lg border border-border p-4 hover:bg-muted/20 transition-colors">
            <div class="rounded-lg bg-success/10 p-3">
              <ng-icon name="heroBookOpen" size="1.5rem" class="text-success" />
            </div>
            <div>
              <p class="font-medium text-foreground">View SDK Docs</p>
              <p class="text-sm text-muted-foreground">Node.js and Go SDK documentation</p>
            </div>
          </a>
        </div>
      </div>
    </div>
  `,
})
export class DashboardComponent {
  readonly store = inject(DashboardStore);
}
