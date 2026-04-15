import { Component } from '@angular/core';

@Component({
  selector: 'app-scim',
  standalone: true,
  template: `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <h2 class="text-2xl font-semibold text-foreground">SCIM Provisioning</h2>
        <button
          class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Generate Token
        </button>
      </div>

      <!-- SCIM Tokens -->
      <div class="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h3 class="text-lg font-semibold text-foreground mb-4">SCIM Tokens</h3>
        <p class="text-sm text-muted-foreground mb-4">
          Generate bearer tokens for IdP integration (Okta, Azure AD, etc.). Tokens are shown only once at creation.
        </p>
        <div class="overflow-hidden rounded-lg border border-border">
          <table class="w-full text-left text-sm">
            <thead class="border-b border-border bg-muted/30">
              <tr>
                <th class="px-4 py-2 font-medium text-muted-foreground">Token Prefix</th>
                <th class="px-4 py-2 font-medium text-muted-foreground">Created</th>
                <th class="px-4 py-2 font-medium text-muted-foreground">Last Used</th>
                <th class="px-4 py-2 font-medium text-muted-foreground">Status</th>
                <th class="px-4 py-2 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colspan="5" class="px-4 py-6 text-center text-muted-foreground">
                  No SCIM tokens configured
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Sync Log -->
      <div class="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h3 class="text-lg font-semibold text-foreground mb-4">Sync Log</h3>
        <p class="text-sm text-muted-foreground">
          View recent SCIM provisioning and deprovisioning events.
        </p>
      </div>
    </div>
  `,
})
export class ScimComponent {}
