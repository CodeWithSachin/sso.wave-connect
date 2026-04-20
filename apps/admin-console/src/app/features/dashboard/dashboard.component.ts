import { Component, inject } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { DatePipe } from '@angular/common';
import { DashboardStore } from './dashboard.store';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [NgIcon, DatePipe],
  providers: [DashboardStore],
  template: `
    <div class="space-y-6">
      <div>
        <h2 class="text-2xl font-bold text-foreground">Dashboard</h2>
        <p class="text-sm text-muted-foreground mt-1">Overview of your tenant's SSO platform</p>
      </div>

      <!-- Stats Cards -->
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div class="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-muted-foreground">Total Users</span>
            <div class="rounded-lg bg-primary/10 p-2">
              <ng-icon name="heroUsers" class="text-primary" size="1.25rem" />
            </div>
          </div>
          <div class="mt-3">
            @if (store.loading()) {
              <div class="h-8 w-20 rounded bg-muted/50 animate-pulse"></div>
            } @else {
              <p class="text-3xl font-bold text-foreground">{{ store.totalUsers() }}</p>
            }
          </div>
        </div>

        <div class="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-muted-foreground">Active Members</span>
            <div class="rounded-lg bg-(--wc-success)/10 p-2">
              <ng-icon name="heroGlobeAlt" class="text-(--wc-success)" size="1.25rem" />
            </div>
          </div>
          <div class="mt-3">
            @if (store.loading()) {
              <div class="h-8 w-20 rounded bg-muted/50 animate-pulse"></div>
            } @else {
              <p class="text-3xl font-bold text-foreground">{{ store.activeSessions() }}</p>
            }
          </div>
        </div>

        <div class="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-muted-foreground">Session Rate</span>
            <div class="rounded-lg bg-(--wc-warning)/10 p-2">
              <ng-icon name="heroChartBar" class="text-(--wc-warning)" size="1.25rem" />
            </div>
          </div>
          <div class="mt-3">
            @if (store.loading()) {
              <div class="h-8 w-20 rounded bg-muted/50 animate-pulse"></div>
            } @else {
              <p class="text-3xl font-bold text-foreground">{{ store.sessionRate() }}%</p>
            }
          </div>
        </div>

        <div class="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-muted-foreground">MFA Enrolled</span>
            <div class="rounded-lg bg-accent p-2">
              <ng-icon name="heroShieldCheck" class="text-accent-foreground" size="1.25rem" />
            </div>
          </div>
          <div class="mt-3">
            @if (store.loading()) {
              <div class="h-8 w-20 rounded bg-muted/50 animate-pulse"></div>
            } @else {
              <p class="text-3xl font-bold text-foreground">{{ store.mfaEnrolled() }}</p>
            }
          </div>
        </div>
      </div>

      <!-- Recent Activity -->
      <div class="rounded-xl border border-border bg-card shadow-sm">
        <div class="px-6 py-4 border-b border-border">
          <h3 class="text-base font-semibold text-foreground">Recent Activity</h3>
        </div>
        <div class="divide-y divide-border">
          @if (store.recentEvents().length === 0) {
            <div class="px-6 py-12 text-center text-muted-foreground text-sm">
              <ng-icon name="heroClipboardDocumentList" size="2rem" class="mx-auto mb-3 opacity-40" />
              <p>No recent activity to display</p>
              <p class="mt-1 text-xs">Events will appear here as users interact with the platform</p>
            </div>
          }
          @for (event of store.recentEvents(); track event.id) {
            <div class="flex items-center gap-4 px-6 py-3">
              <div class="rounded-lg bg-muted/50 p-2">
                <ng-icon name="heroBolt" size="1rem" class="text-muted-foreground" />
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-foreground truncate">{{ event.action }}</p>
                <p class="text-xs text-muted-foreground">{{ event.resourceType }} &middot; {{ event.actorId }}</p>
              </div>
              <span class="text-xs text-muted-foreground whitespace-nowrap">
                {{ event.createdAt | date:'short' }}
              </span>
            </div>
          }
        </div>
      </div>
    </div>
  `,
})
export class DashboardComponent {
  readonly store = inject(DashboardStore);
}
