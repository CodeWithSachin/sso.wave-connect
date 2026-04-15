import { Component } from '@angular/core';

@Component({
  selector: 'app-groups',
  standalone: true,
  template: `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <h2 class="text-2xl font-semibold text-foreground">Groups</h2>
        <button
          class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Create Group
        </button>
      </div>

      <div class="rounded-xl border border-border bg-card p-6 shadow-sm">
        <p class="text-sm text-muted-foreground">
          Manage groups and team memberships. Groups integrate with OpenFGA for relationship-based access control.
        </p>
      </div>
    </div>
  `,
})
export class GroupsComponent {}
