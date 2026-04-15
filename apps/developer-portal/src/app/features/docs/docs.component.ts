import { Component } from '@angular/core';

@Component({
  selector: 'app-docs',
  standalone: true,
  template: `
    <div class="space-y-6">
      <h2 class="text-2xl font-semibold text-foreground">SDK Documentation</h2>

      <div class="grid gap-4 sm:grid-cols-2">
        <!-- Node.js SDK -->
        <div class="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div class="flex items-center gap-3 mb-4">
            <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10 text-success font-bold">JS</div>
            <div>
              <h3 class="font-semibold text-foreground">Node.js / TypeScript</h3>
              <p class="text-xs text-muted-foreground">&#64;wave-connect/sso-sdk</p>
            </div>
          </div>
          <code class="block rounded bg-muted/30 px-3 py-2 text-sm font-mono text-foreground mb-3">
            npm install &#64;wave-connect/sso-sdk
          </code>
          <p class="text-sm text-muted-foreground">
            PASETO token verification, Express middleware, ReBAC permission checks.
          </p>
        </div>

        <!-- Go SDK -->
        <div class="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div class="flex items-center gap-3 mb-4">
            <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold">Go</div>
            <div>
              <h3 class="font-semibold text-foreground">Go</h3>
              <p class="text-xs text-muted-foreground">github.com/wave-connect/sso-sdk-go</p>
            </div>
          </div>
          <code class="block rounded bg-muted/30 px-3 py-2 text-sm font-mono text-foreground mb-3">
            go get github.com/wave-connect/sso-sdk-go
          </code>
          <p class="text-sm text-muted-foreground">
            PASETO v4 verification, HTTP middleware (Fiber/Echo/Chi), ReBAC checks.
          </p>
        </div>
      </div>

      <!-- API Reference -->
      <div class="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h3 class="text-lg font-semibold text-foreground mb-3">API Reference</h3>
        <p class="text-sm text-muted-foreground mb-3">
          Full OpenAPI documentation for all platform endpoints.
        </p>
        <a href="/api/docs" target="_blank"
           class="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
          Open Swagger Docs
        </a>
      </div>
    </div>
  `,
})
export class DocsComponent {}
