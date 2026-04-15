import { Component } from '@angular/core';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  template: `
    <div class="space-y-6">
      <h2 class="text-2xl font-semibold text-foreground">Developer Dashboard</h2>

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div class="rounded-xl border border-border bg-card p-6 shadow-sm">
          <p class="text-sm text-muted-foreground">Active API Keys</p>
          <p class="mt-2 text-3xl font-bold text-foreground">--</p>
        </div>
        <div class="rounded-xl border border-border bg-card p-6 shadow-sm">
          <p class="text-sm text-muted-foreground">OAuth Applications</p>
          <p class="mt-2 text-3xl font-bold text-foreground">--</p>
        </div>
        <div class="rounded-xl border border-border bg-card p-6 shadow-sm">
          <p class="text-sm text-muted-foreground">API Requests (30d)</p>
          <p class="mt-2 text-3xl font-bold text-foreground">--</p>
        </div>
      </div>

      <div class="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h3 class="text-lg font-semibold text-foreground mb-4">Quick Start</h3>
        <div class="grid gap-3 sm:grid-cols-2">
          <a href="/api-keys" class="rounded-lg border border-border p-4 hover:bg-accent/50 transition-colors">
            <p class="font-medium text-foreground">Create an API Key</p>
            <p class="text-sm text-muted-foreground">Generate keys for server-to-server auth</p>
          </a>
          <a href="/docs" class="rounded-lg border border-border p-4 hover:bg-accent/50 transition-colors">
            <p class="font-medium text-foreground">View SDK Docs</p>
            <p class="text-sm text-muted-foreground">Node.js, Go, and Python SDKs</p>
          </a>
        </div>
      </div>
    </div>
  `,
})
export class DashboardComponent {}
