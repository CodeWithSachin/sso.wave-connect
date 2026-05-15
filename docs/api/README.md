# API Reference

This directory holds the **committed source of truth** for every service's
public API contract. Each service also serves its docs in-process at
`/openapi.json` + `/reference`, and a unified portal at `apps/api-docs`
aggregates everything offline.

## Why this exists

- Single onboarding surface for developers (human and agent) consuming
  WaveConnect services.
- CI gate (`pnpm docs:export && git diff --exit-code docs/api/`) detects
  handler-vs-spec drift on every PR.
- Build-time aggregation in the portal means **the portal works offline,
  with no service running, and without CORS**.

## Why Scalar (vs Swagger UI / Redoc / Stoplight)

| Concern | Scalar | Swagger UI | Redoc |
|---------|--------|------------|-------|
| Renders OpenAPI 2 *and* 3 | ✓ | ✓ (with quirks) | 3 only |
| Multi-source single UI | ✓ (`sources[]`) | ✗ | partial |
| Modern theming + responsive | ✓ | dated | ✓ |
| Embeds in any framework | ✓ (CDN bundle) | requires loader | requires loader |
| Open source, self-hostable | ✓ | ✓ | ✓ (community) |
| Try-it / API client built in | ✓ | ✓ | ✗ |

Scalar wins on the multi-source aggregation requirement; Swagger UI loses
on theming and on rendering modern OpenAPI 3 features. ADR:
`/Users/SACHIN.SINGH/.claude/plans/agent-skills-you-temporal-prism.md`
(decision record from the integration session).

## Architecture

```
  ┌──────────────────────────────────────────────────────┐
  │  apps/api-docs (Nx app)                              │
  │  ─ build.mjs reads docs/api/<svc>/openapi.json       │
  │     + docs/api/grpc/services.yaml                    │
  │     + node_modules/@scalar/api-reference (self-host) │
  │  ─ writes dist/apps/api-docs/{index.html,specs,grpc} │
  │  ─ served by http-server at :4500                    │
  └─────────────────────▲────────────────────────────────┘
                        │ (build-time copy, no runtime fetch)
                        │
  ┌─────────────────────┴────────────────────────────────┐
  │  docs/api/<svc>/openapi.json   (committed)           │
  │  ↑                                                   │
  │  pnpm docs:export (run on every handler change)      │
  │  ↑                                                   │
  │  NestJS: scripts/export-openapi.ts + @nestjs/swagger │
  │  Go:     swag init  ➜  internal/openapi/swagger.json │
  └──────────────────────────────────────────────────────┘
                        │
                        │ (in-process /openapi.json + /reference)
                        ▼
  ┌──────────────────────────────────────────────────────┐
  │  Each of 8 services                                  │
  │  ─ Loads its committed spec at startup               │
  │  ─ Serves /openapi.json + /reference (env-gated)     │
  │  ─ CORS open on those two routes only                │
  └──────────────────────────────────────────────────────┘
```

## Live endpoints (dev)

| Service                | Port | Spec                          | Reference                  |
|------------------------|------|-------------------------------|----------------------------|
| admin-api              | 3100 | `localhost:3100/openapi.json` | `localhost:3100/reference` |
| audit-service          | 3400 | `localhost:3400/openapi.json` | `localhost:3400/reference` |
| developer-portal-api   | 3500 | `localhost:3500/openapi.json` | `localhost:3500/reference` |
| directory-service      | 3200 | `localhost:3200/openapi.json` | `localhost:3200/reference` |
| webhook-service        | 3300 | `localhost:3300/openapi.json` | `localhost:3300/reference` |
| identity-service       | 3001 | `localhost:3001/openapi.json` | `localhost:3001/reference` |
| authz-service          | 3000 | `localhost:3000/openapi.json` | `localhost:3000/reference` |
| sso-service            | 3002 | `localhost:3002/openapi.json` | `localhost:3002/reference` |
| **portal**             | 4500 | (offline-capable)             | `localhost:4500/`          |

Per-service `/openapi.json` and `/reference` are **env-gated** behind
`ENABLE_OPENAPI`. Default is enabled; production deployments set
`ENABLE_OPENAPI=false` to remove the public spec endpoint entirely.

## OpenAPI version: 2 vs 3

- **NestJS services** emit **OpenAPI 3.0** (via `@nestjs/swagger`).
- **Go services** emit **OpenAPI 2.0** (Swagger 2.0, via `swaggo/swag`).
- Scalar converts v2 → v3 at render time, so the portal shows everything
  uniformly. Tooling that consumes raw specs should be tolerant of both,
  or pre-convert via `swagger2openapi`.

## Workflows

### Regenerating committed specs

```sh
pnpm docs:export      # writes docs/api/<svc>/openapi.json for all 8 services
```

NestJS services boot in no-listen mode (`NestFactory.create` + immediate
`app.close()`) and emit the doc via `SwaggerModule.createDocument`. Go
services run `swag init -g cmd/server/main.go -o internal/openapi`, then
copy `swagger.json` into `docs/api/<svc>/`.

### Browsing locally

```sh
pnpm docs:build && pnpm docs:serve   # http://localhost:4500
```

`build` populates `dist/apps/api-docs/` from `docs/api/`; `serve` boots
http-server on 4500. The portal works **with zero backend services
running** — that's the point of build-time aggregation.

### Adding a new endpoint

**NestJS:** add `@ApiOperation`, `@ApiTags`, `@ApiResponse`,
`@ApiBearerAuth()` decorators to the controller method. Then:

```sh
pnpm nx run <service>:openapi:export
git diff docs/api/<service>/openapi.json    # sanity-check what changed
```

**Go (Fiber):** add a swag annotation block above the handler method.
Use real DTOs from `internal/model/` instead of `map[string]string` so
the generated spec carries property names:

```go
// Register creates a new user account.
//
//  @Summary  Register a user
//  @Tags     auth
//  @Accept   json
//  @Produce  json
//  @Param    X-Tenant-ID  header  string  true  "Tenant ID"
//  @Param    body         body    model.RegisterRequest  true  "Payload"
//  @Success  201  {object}  model.AuthResponse
//  @Failure  400  {object}  model.ErrorResponse
//  @Router   /auth/register [post]
//  @Security BearerAuth
func (h *AuthHandler) Register(c *fiber.Ctx) error { ... }
```

Then `pnpm nx run <service>:openapi:export`.

### Adding a gRPC RPC

`docs/api/grpc/services.yaml` is **hand-curated** — `.proto` files have no
`google.api.http` annotations so we can't auto-generate. When you add an
RPC:

1. Add the new path to `docs/api/grpc/services.yaml`.
2. Run `pnpm docs:check` — it counts RPCs in `libs/proto/*.proto` vs
   paths in `services.yaml` and fails if they diverge. This catches the
   common "added an RPC, forgot the doc" mistake at PR time.

### CI gate

```sh
pnpm docs:export
git diff --exit-code docs/api/    # fails if regenerated specs differ from commit
pnpm docs:check                    # fails on gRPC drift
```

Add both to your CI workflow. The expected failure mode is "you changed
a handler but didn't commit the regenerated spec" — the fix is to run
`pnpm docs:export` and commit the diff.

## Troubleshooting

- **Portal renders an empty "Introduction" screen.** Run `pnpm docs:build`
  first — the portal serves `dist/apps/api-docs/`, which doesn't exist
  until the build script copies specs into it.
- **Spec endpoint returns 404 in a deployed environment.** Check
  `ENABLE_OPENAPI`. In production we default to *disabled* — set it
  explicitly to `true` if you need spec exposure (e.g., staging).
- **`swag init` reports "no Go files in apps/<svc>".** Run from the
  service directory: `cd apps/identity-service && swag init -g
  cmd/server/main.go -o internal/openapi`. The Nx target does this
  automatically.
- **NestJS export script crashes on missing dep.** Run `pnpm install` —
  `tsx` is a workspace dev-dep.
- **`/reference` shows a broken page in a Go service.** The Scalar
  bundle is loaded from jsDelivr with a pinned version + SRI hash
  (`libs/go-scalar/scalar.go`). A mismatch fails the integrity check
  intentionally. Bump `scalarVersion` + `scalarIntegrity` together.

## gRPC reference

`grpc/services.yaml` documents the 9 gRPC RPCs across identity / authz /
audit. It is hand-curated because the `.proto` files have no
`google.api.http` annotations (services are gRPC-only by design). Call
them with `grpcurl`, the generated Go stubs in `libs/proto/gen/go/`, or
any gRPC client. Reflection is enabled on every gRPC server.

## Files

```
docs/api/
├── README.md                          (this file)
├── admin-api/openapi.json             (NestJS — OpenAPI 3.0)
├── audit-service/openapi.json         (NestJS — OpenAPI 3.0)
├── authz-service/openapi.{json,yaml}  (Go    — OpenAPI 2.0)
├── developer-portal-api/openapi.json  (NestJS — OpenAPI 3.0)
├── directory-service/openapi.json     (NestJS — OpenAPI 3.0)
├── grpc/services.yaml                 (hand-curated — OpenAPI 3.0)
├── identity-service/openapi.{json,yaml} (Go  — OpenAPI 2.0)
├── sso-service/openapi.{json,yaml}    (Go    — OpenAPI 2.0)
└── webhook-service/openapi.json       (NestJS — OpenAPI 3.0)
```

## Annotation depth — known gaps

The current swag/swagger annotations are **minimum-viable**: every
handler has `@Summary`, `@Tags`, `@Router`, `@Success`, `@Failure`, but
not every one carries fully-typed DTOs. Several request bodies and
response shapes are typed as `map[string]string` / `map[string]any`.
The portal renders fine, but generated clients lose property names.

Filling these in is tracked as documentation debt — pick one service at
a time, replace inline maps with `model.*` DTOs, regenerate, commit.
