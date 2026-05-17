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

### API documentation (Scalar + OpenAPI)

Every service exposes its API contract two ways: an in-process `/openapi.json` + `/reference` route (env-gated by `ENABLE_OPENAPI`), and a **committed** OpenAPI spec under `docs/api/<svc>/openapi.json`. A unified [apps/api-docs](apps/api-docs) portal aggregates all specs at build time.

**When you change a handler, you MUST regenerate the committed spec:**

```sh
pnpm nx run <service>:openapi:export    # one service
pnpm docs:export                         # all services
```

CI fails on `git diff --exit-code docs/api/` if you forget. The root-cause fix is always "annotation drifted from handler" — re-export and commit.

- **NestJS services** (`admin-api`, `audit-service`, `developer-portal-api`, `directory-service`, `webhook-service`): annotate controllers with `@ApiOperation`/`@ApiTags`/`@ApiResponse` from `@nestjs/swagger`. Per-service config lives in `apps/<svc>/src/openapi.config.ts` (consumed by both `main.ts` and `scripts/export-openapi.ts` — edit it in one place).
- **Go services** (`identity-service`, `authz-service`, `sso-service`): annotate Fiber handlers with `swaggo` comments (`// @Summary`, `// @Tags`, `// @Router`, etc.). The Scalar HTML shell is in `libs/go-scalar` (shared across all three services — do not re-add per-service copies). swag emits OpenAPI 2.0; Scalar converts to v3 at render time. The Scalar CDN bundle is pinned + SRI'd in `libs/go-scalar/scalar.go` — bump `scalarVersion` and `scalarIntegrity` together when upgrading.
- **gRPC** (`libs/proto/*.proto`): documentation lives at `docs/api/grpc/services.yaml` and is **hand-curated** because the `.proto` files have no `google.api.http` annotations. When you add an RPC, update `services.yaml` and run `pnpm docs:check` to confirm RPC counts match.
- **Portal** (`apps/api-docs`): build-time aggregation only. `pnpm docs:build` copies every spec + the self-hosted Scalar bundle into `dist/apps/api-docs/`. Works offline, no CORS, no live-service coupling. Port 4500.

`pnpm docs:export` requires `swag` (`go install github.com/swaggo/swag/cmd/swag@latest`) and `tsx` (already in workspace devDeps).

**Agent skill installed globally:** [`scalar-docs`](https://skills.sh/scalar/scalar) at `~/.agents/skills/scalar-docs/`. It guides Scalar configuration choices — its instructions are loaded whenever you work on docs in any repo.

### RBAC (capabilities + role-based access)

Authoritative reference: [docs/architecture/rbac.md](docs/architecture/rbac.md). ADR-0002 in [the plan file](/Users/SACHIN.SINGH/.claude/plans/agent-skills-you-temporal-prism.md).

**Single capability vocabulary.** Both consoles + both NestJS services share the `Capability` union in [libs/shared-types/src/lib/enums.ts](libs/shared-types/src/lib/enums.ts). The (role, tenant kind, platform role) → capabilities matrix is the **one place** that derives the list: [libs/nestjs-auth/src/lib/capabilities.ts](libs/nestjs-auth/src/lib/capabilities.ts). Never re-derive elsewhere.

**Adding a new endpoint** — REQUIRED:

```ts
// libs/nestjs-auth provides @RequireCapability and is wired as APP_GUARD
// in both admin-api and developer-portal-api.
@Post()
@RequireCapability('manage_api_keys')
create(...) { ... }
```

Forgetting the decorator means the endpoint inherits SessionCookieGuard's "any authenticated user" gate — a security regression. Multi-cap `@RequireCapability('a', 'b')` is union semantics (any-of), matching the Angular `requireCapability([...])` route guard exactly.

**Adding a new route in either console** — also REQUIRED:

```ts
// apps/<console>/src/app/app.routes.ts
{
  path: 'scim',
  canActivate: [requireCapability(['manage_scim_tokens'])],
  loadComponent: () => import('./features/scim/...'),
}
```

**Adding a new capability** — one-liner in each of:
1. `libs/shared-types/src/lib/enums.ts` (union)
2. `libs/nestjs-auth/src/lib/capabilities.ts` (`computeCapabilities` matrix)
3. relevant controllers (`@RequireCapability(...)`)
4. relevant routes + nav (frontend guards)

**Sidebar nav filter** mirrors route guards. Empty `caps: []` shows to any authenticated user (e.g. Dashboard, Account). Items are filtered against `SessionStore.capabilities()` — a 30 s poll keeps the list fresh.

**OpenFGA / per-resource permissions** are deliberately deferred — see [docs/architecture/adr-0003-openfga.md](docs/architecture/adr-0003-openfga.md). Today's capability layer answers "can manage X in general"; per-instance ACLs land when we have a use case.

