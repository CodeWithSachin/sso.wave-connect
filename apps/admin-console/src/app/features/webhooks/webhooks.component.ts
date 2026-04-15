import { Component } from '@angular/core';

@Component({
  selector: 'app-webhooks',
  standalone: true,
  template: `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <h2 class="text-2xl font-semibold text-foreground">Webhooks</h2>
        <button
          class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Add Endpoint
        </button>
      </div>

      <div class="rounded-xl border border-border bg-card p-6 shadow-sm">
        <p class="text-sm text-muted-foreground">
          Configure webhook endpoints to receive real-time event notifications for user, group, and permission changes.
        </p>
      </div>
    </div>
  `,
})
export class WebhooksComponent {}
