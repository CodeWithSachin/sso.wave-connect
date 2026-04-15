import { Component } from '@angular/core';

@Component({
  selector: 'app-audit',
  standalone: true,
  template: `
    <div class="space-y-6">
      <h2 class="text-2xl font-semibold text-foreground">Audit Log</h2>

      <!-- Filters -->
      <div class="flex flex-wrap gap-3">
        <input type="date" placeholder="Start Date"
          class="rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground" />
        <input type="date" placeholder="End Date"
          class="rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground" />
        <select class="rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground">
          <option value="">All Actions</option>
          <option value="user.created">user.created</option>
          <option value="user.login">user.login</option>
          <option value="permission.granted">permission.granted</option>
        </select>
        <button
          class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Search
        </button>
      </div>

      <!-- Log Table -->
      <div class="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <table class="w-full text-left text-sm">
          <thead class="border-b border-border bg-muted/30">
            <tr>
              <th class="px-6 py-3 font-medium text-muted-foreground">Timestamp</th>
              <th class="px-6 py-3 font-medium text-muted-foreground">Action</th>
              <th class="px-6 py-3 font-medium text-muted-foreground">Actor</th>
              <th class="px-6 py-3 font-medium text-muted-foreground">Resource</th>
              <th class="px-6 py-3 font-medium text-muted-foreground">IP Address</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colspan="5" class="px-6 py-8 text-center text-muted-foreground">
                Select a date range and click Search to view audit logs.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class AuditComponent {}
