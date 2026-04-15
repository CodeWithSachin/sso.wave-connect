import { Component } from '@angular/core';

@Component({
  selector: 'app-oauth-apps',
  standalone: true,
  template: `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <h2 class="text-2xl font-semibold text-foreground">OAuth Applications</h2>
        <button class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
          Register App
        </button>
      </div>

      <div class="rounded-xl border border-border bg-card p-6 shadow-sm">
        <p class="text-sm text-muted-foreground">
          Register OAuth 2.0 applications to integrate with the SSO platform.
          Each app gets a client_id and client_secret for the authorization code flow with PKCE.
        </p>
      </div>

      <div class="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <table class="w-full text-left text-sm">
          <thead class="border-b border-border bg-muted/30">
            <tr>
              <th class="px-6 py-3 font-medium text-muted-foreground">App Name</th>
              <th class="px-6 py-3 font-medium text-muted-foreground">Client ID</th>
              <th class="px-6 py-3 font-medium text-muted-foreground">Redirect URIs</th>
              <th class="px-6 py-3 font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colspan="4" class="px-6 py-8 text-center text-muted-foreground">
                No OAuth applications registered yet.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class OAuthAppsComponent {}
