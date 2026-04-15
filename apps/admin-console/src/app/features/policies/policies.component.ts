import { Component } from '@angular/core';

@Component({
  selector: 'app-policies',
  standalone: true,
  template: `
    <div class="space-y-6">
      <h2 class="text-2xl font-semibold text-foreground">Security Policies</h2>

      <div class="grid gap-6">
        <!-- Password Policy -->
        <div class="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h3 class="text-lg font-semibold text-foreground mb-4">Password Policy</h3>
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label class="block text-sm font-medium text-muted-foreground mb-1">Minimum Length</label>
              <input type="number" value="12"
                class="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground" />
            </div>
            <div>
              <label class="block text-sm font-medium text-muted-foreground mb-1">Password History</label>
              <input type="number" value="5"
                class="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground" />
            </div>
          </div>
        </div>

        <!-- Session Policy -->
        <div class="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h3 class="text-lg font-semibold text-foreground mb-4">Session Policy</h3>
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label class="block text-sm font-medium text-muted-foreground mb-1">Max Session Age (hours)</label>
              <input type="number" value="24"
                class="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground" />
            </div>
            <div>
              <label class="block text-sm font-medium text-muted-foreground mb-1">Idle Timeout (minutes)</label>
              <input type="number" value="60"
                class="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground" />
            </div>
          </div>
        </div>

        <!-- MFA Policy -->
        <div class="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h3 class="text-lg font-semibold text-foreground mb-4">MFA Policy</h3>
          <label class="flex items-center gap-3 text-sm text-foreground">
            <input type="checkbox" class="rounded border-border" />
            Require MFA for all users
          </label>
        </div>
      </div>

      <button
        class="rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        Save Policies
      </button>
    </div>
  `,
})
export class PoliciesComponent {}
