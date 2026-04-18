<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

# General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

<!-- nx configuration end-->

## Project-specific notes

### Zoneless Angular (login-portal)

- `login-portal` runs with `provideZonelessChangeDetection()` (Angular 21.2 + ngrx/signals 21.1, no Zone.js). Change detection is driven entirely by signals + the consumer graph.
- **Preview testing quirk:** `preview_click` over CDP dispatches mouse events that don't always synthesize a real `click` event Angular's `(click)` binding picks up. When verifying a click handler via the browser preview, dispatch the event from JavaScript instead:
  ```js
  document.querySelector('[data-testid="..."]').click();
  ```
  Called via `preview_eval`. `btn.click()` synthesizes a real `click` event that traverses the event listeners Angular installs. Tracked in the Phase 5 verification writeup.
- Prefer `httpResource` / `toSignal` / `computed` for new async-reactive code. The migration / select-tenant / invitation components are reference implementations.

### OpenFGA bootstrap

- Fresh environments must have an OpenFGA store + model before authz-service boots. `./openfga/scripts/bootstrap.sh` is idempotent — run it once per env, it writes the resolved store id to `openfga/.store-id`. Copy that value into `apps/authz-service/config.yaml:openfga.store_id` (or set `OPENFGA_STORE_ID` env).

### Docker Desktop instability (local only)

- Docker Desktop on the dev machine cycles down under combined Go + Node + Angular load. Pattern: pre-compile Go binaries (`go build -o /tmp/... ./cmd/server`) rather than `go run`, and keep the build-pool interaction short. The `sso-postgres` container at `localhost:5433` is the primary state; pool resets show up as connection-refused on `::1:5433` in service logs.

