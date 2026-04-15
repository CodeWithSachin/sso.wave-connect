import { Component } from '@angular/core';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  template: `
    <div class="space-y-6">
      <h2 class="text-2xl font-semibold text-foreground">Dashboard</h2>

      <!-- Stat Cards -->
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div class="rounded-xl border border-border bg-card p-6 shadow-sm">
          <p class="text-sm text-muted-foreground">Total Users</p>
          <p class="mt-2 text-3xl font-bold text-foreground">--</p>
        </div>
        <div class="rounded-xl border border-border bg-card p-6 shadow-sm">
          <p class="text-sm text-muted-foreground">Active Sessions</p>
          <p class="mt-2 text-3xl font-bold text-foreground">--</p>
        </div>
        <div class="rounded-xl border border-border bg-card p-6 shadow-sm">
          <p class="text-sm text-muted-foreground">Webhooks</p>
          <p class="mt-2 text-3xl font-bold text-foreground">--</p>
        </div>
        <div class="rounded-xl border border-border bg-card p-6 shadow-sm">
          <p class="text-sm text-muted-foreground">MFA Enrolled</p>
          <p class="mt-2 text-3xl font-bold text-foreground">--</p>
        </div>
      </div>

      <!-- Recent Activity -->
      <div class="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h3 class="text-lg font-semibold text-foreground mb-4">Recent Activity</h3>
        <p class="text-sm text-muted-foreground">
          Connect to the audit service to view recent events.
        </p>
      </div>
    </div>
  `,
})
export class DashboardComponent {}
