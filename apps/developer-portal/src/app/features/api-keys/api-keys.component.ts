import { Component, signal } from '@angular/core';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-api-keys',
  standalone: true,
  template: `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <h2 class="text-2xl font-semibold text-foreground">API Keys</h2>
        <button
          (click)="createKey()"
          class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Create API Key
        </button>
      </div>

      @if (newKey()) {
        <div class="rounded-xl border-2 border-success bg-success/5 p-4">
          <p class="text-sm font-medium text-success mb-2">API Key Created — copy it now (shown only once)</p>
          <div class="flex items-center gap-2">
            <code class="flex-1 rounded bg-card px-3 py-2 text-sm font-mono text-foreground border">{{ newKey() }}</code>
            <button
              (click)="copyKey()"
              class="rounded-lg bg-secondary px-3 py-2 text-sm text-secondary-foreground hover:bg-secondary/80"
            >
              Copy
            </button>
          </div>
        </div>
      }

      <div class="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <table class="w-full text-left text-sm">
          <thead class="border-b border-border bg-muted/30">
            <tr>
              <th class="px-6 py-3 font-medium text-muted-foreground">Name</th>
              <th class="px-6 py-3 font-medium text-muted-foreground">Prefix</th>
              <th class="px-6 py-3 font-medium text-muted-foreground">Status</th>
              <th class="px-6 py-3 font-medium text-muted-foreground">Last Used</th>
              <th class="px-6 py-3 font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colspan="5" class="px-6 py-8 text-center text-muted-foreground">
                No API keys yet. Create one to get started.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class ApiKeysComponent {
  newKey = signal<string | null>(null);

  async createKey() {
    const name = prompt('Enter a name for this API key:');
    if (!name) return;

    try {
      const res = await fetch(`${environment.devPortalApiUrl}/api/v1/api-keys`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionStorage.getItem('accessToken') ?? ''}`,
        },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      this.newKey.set(data.key);
    } catch (err) {
      alert('Failed to create API key');
    }
  }

  copyKey() {
    const key = this.newKey();
    if (key) {
      navigator.clipboard.writeText(key);
    }
  }
}
