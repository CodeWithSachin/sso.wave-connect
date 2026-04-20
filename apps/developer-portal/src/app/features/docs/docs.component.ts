import { Component, inject } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { DocsStore } from './docs.store';

@Component({
  selector: 'app-docs',
  standalone: true,
  imports: [NgIcon],
  providers: [DocsStore],
  template: `
    <div class="space-y-6">
      <div>
        <h2 class="text-2xl font-bold text-foreground">SDK Documentation</h2>
        <p class="text-sm text-muted-foreground mt-1">Integrate with the WaveConnect SSO platform</p>
      </div>

      <!-- SDK Cards -->
      <div class="grid gap-4 sm:grid-cols-2">
        @if (store.sdks().length > 0) {
          @for (sdk of store.sdks(); track sdk.language) {
            <div class="rounded-xl border border-border bg-card p-6 shadow-sm">
              <div class="flex items-center gap-3 mb-4">
                <div class="flex h-10 w-10 items-center justify-center rounded-lg text-sm font-bold"
                  [class]="sdk.language === 'node' ? 'bg-(--wc-success)/10 text-(--wc-success)' : 'bg-primary/10 text-primary'">
                  {{ sdk.language === 'node' ? 'JS' : 'Go' }}
                </div>
                <div>
                  <h3 class="font-semibold text-foreground">{{ sdk.name }}</h3>
                  <p class="text-xs text-muted-foreground">v{{ sdk.version }}</p>
                </div>
              </div>
              <div class="flex items-center gap-2 rounded-lg bg-muted/30 px-3 py-2 mb-3">
                <code class="flex-1 text-sm font-mono text-foreground">{{ sdk.installCommand }}</code>
                <button (click)="copyToClipboard(sdk.installCommand)"
                  class="rounded p-1 text-muted-foreground hover:bg-muted/50 transition-colors shrink-0">
                  <ng-icon name="heroClipboard" size="1rem" />
                </button>
              </div>
            </div>
          }
        } @else {
          <!-- Static fallback cards -->
          <div class="rounded-xl border border-border bg-card p-6 shadow-sm">
            <div class="flex items-center gap-3 mb-4">
              <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-(--wc-success)/10 text-(--wc-success) font-bold text-sm">JS</div>
              <div>
                <h3 class="font-semibold text-foreground">Node.js / TypeScript</h3>
                <p class="text-xs text-muted-foreground">&#64;wave-connect/sso-sdk</p>
              </div>
            </div>
            <div class="flex items-center gap-2 rounded-lg bg-muted/30 px-3 py-2 mb-3">
              <code class="flex-1 text-sm font-mono text-foreground">npm install &#64;wave-connect/sso-sdk</code>
              <button (click)="copyToClipboard('npm install @wave-connect/sso-sdk')"
                class="rounded p-1 text-muted-foreground hover:bg-muted/50 transition-colors shrink-0">
                <ng-icon name="heroClipboard" size="1rem" />
              </button>
            </div>
            <p class="text-sm text-muted-foreground">PASETO token verification, Express middleware, ReBAC permission checks.</p>
          </div>

          <div class="rounded-xl border border-border bg-card p-6 shadow-sm">
            <div class="flex items-center gap-3 mb-4">
              <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold text-sm">Go</div>
              <div>
                <h3 class="font-semibold text-foreground">Go</h3>
                <p class="text-xs text-muted-foreground">github.com/wave-connect/sso-sdk-go</p>
              </div>
            </div>
            <div class="flex items-center gap-2 rounded-lg bg-muted/30 px-3 py-2 mb-3">
              <code class="flex-1 text-sm font-mono text-foreground">go get github.com/wave-connect/sso-sdk-go</code>
              <button (click)="copyToClipboard('go get github.com/wave-connect/sso-sdk-go')"
                class="rounded p-1 text-muted-foreground hover:bg-muted/50 transition-colors shrink-0">
                <ng-icon name="heroClipboard" size="1rem" />
              </button>
            </div>
            <p class="text-sm text-muted-foreground">PASETO v4 verification, HTTP middleware (Fiber/Echo/Chi), ReBAC checks.</p>
          </div>
        }
      </div>

      <!-- Code Examples -->
      @if (store.examples().length > 0) {
        <div class="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div class="px-6 py-4 border-b border-border">
            <h3 class="text-base font-semibold text-foreground">Code Examples</h3>
          </div>
          <div class="divide-y divide-border">
            @for (example of store.examples(); track example.type) {
              <div class="p-6">
                <h4 class="text-sm font-semibold text-foreground mb-1">{{ example.title }}</h4>
                <p class="text-xs text-muted-foreground mb-3">{{ example.description }}</p>
                @for (entry of objectEntries(example.examples); track entry[0]) {
                  <div class="mb-3">
                    <span class="text-xs font-medium text-muted-foreground uppercase">{{ entry[0] }}</span>
                    <pre class="mt-1 rounded-lg bg-muted/30 p-4 text-sm font-mono text-foreground overflow-x-auto"><code>{{ entry[1] }}</code></pre>
                  </div>
                }
              </div>
            }
          </div>
        </div>
      }

      <!-- API Reference -->
      <div class="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div class="flex items-center gap-3 mb-3">
          <ng-icon name="heroDocumentText" size="1.25rem" class="text-muted-foreground" />
          <h3 class="text-base font-semibold text-foreground">API Reference</h3>
        </div>
        <p class="text-sm text-muted-foreground mb-4">Full OpenAPI documentation for all platform endpoints.</p>
        <a href="/api/docs" target="_blank"
          class="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
          <ng-icon name="heroArrowTopRightOnSquare" size="1rem" />
          Open Swagger Docs
        </a>
      </div>
    </div>
  `,
})
export class DocsComponent {
  readonly store = inject(DocsStore);

  objectEntries(obj: Record<string, string>): [string, string][] {
    return Object.entries(obj ?? {});
  }

  copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
  }
}
