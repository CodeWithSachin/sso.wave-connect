# AGENT.md — WaveConnect SSO Platform

Onboarding map for AI agents (and humans) working in this repo. Read this first,
then use the linked files for detail. Cross-cutting rules also live in
[CLAUDE.md](CLAUDE.md) (Nx, zoneless Angular, Docker, OpenFGA bootstrap quirks).

---

## What this repo is

An Nx pnpm monorepo implementing a multi-tenant SSO / IAM platform
("WaveConnect"). Three frontends, eight backend services, eleven shared libs.
Polyglot: Angular 21 + NestJS 11 + Go (Fiber + gRPC). Identity & authz are Go;
admin/dev surface area is NestJS.

Current branch context (Phase 4–5): email-first login (`/auth/public/discover`),
multi-tenant switching, refresh-token families. See [KT/](KT/) for the phase
plan.

---

## Apps

### Frontends (Angular 21, except `site`)

| App | Port | Purpose | Notes |
|---|---|---|---|
| `login-portal` | 4300 | Sign-up / sign-in / MFA / invitations / verify-email / verify-domain / select-tenant | **Zoneless** (`provideZonelessChangeDetection()`, ngrx/signals 21.1). Hardcoded dev `X-Tenant-ID` interceptor at [app.config.ts:10](apps/login-portal/src/app/app.config.ts:10) — respects pre-set headers since the discover-driven login fix. |
| `admin-console` | 4301 | Tenant admin UI — users, groups, IdPs, policies, domains, platform admins | Talks to `admin-api`. PrimeNG + Tailwind. |
| `developer-portal` | 4302 | OAuth client + webhook configuration, SDK docs | Talks to `developer-portal-api`. |
| `site` | 4400 | Astro marketing/docs site | Not part of `serve:all`. |

E2E (Playwright): `login-portal-e2e`, `admin-console-e2e`, `developer-portal-e2e`, `admin-api-e2e`.

### Backends — Go (Fiber HTTP + gRPC)

| App | HTTP | gRPC | Purpose |
|---|---|---|---|
| `identity-service` | 3000 | 50052 | **Auth core.** Signup (consumer + org), login, MFA, email/domain verification, sessions, refresh families, `/auth/public/discover`, migration, invitations. Config: [apps/identity-service/config.yaml](apps/identity-service/config.yaml). |
| `sso-service` | 8083 | — | OAuth 2.1 / OIDC provider. Issues access/refresh/id tokens after identity-service authenticates. |
| `authz-service` | 8082 | 50051 | OpenFGA gateway. Consumes the `authz_outbox` table written transactionally by identity-service and pushes tuples into FGA. Dual-layer (memory + Redis) cache. |

Go layout convention: `cmd/server/main.go`, `internal/handler/`, `internal/service/`, `internal/repository/`, `internal/middleware/`, `internal/model/`.

### Backends — NestJS 11

| App | Port | Purpose |
|---|---|---|
| `admin-api` | 3100 | Tenant administration backend for `admin-console`. Owns `GET /api/v1/session/me` (the bootstrap call). Uses **Prisma** — schema at [apps/admin-api/prisma/schema.prisma](apps/admin-api/prisma/schema.prisma). Swagger at `/docs`. |
| `developer-portal-api` | 3500 | Backend for `developer-portal` — OAuth client mgmt, webhook config. Swagger at `/api/docs`. |
| `directory-service` | 3200 | User directory / SCIM-ish surface. |
| `webhook-service` | 3300 | Outbound webhook delivery + retries. NATS consumer. |
| `audit-service` | 3400 | Audit log ingestion. NATS consumer. |

---

## Libs

| Lib | Type | Consumers / Purpose |
|---|---|---|
| `auth-guards` | TS | Nest guards (PASETO / session cookie) for the Nest services. |
| `nestjs-auth` | TS | Auth decorators + strategies shared across Nest backends. |
| `nestjs-email` | TS | Email-sender abstraction (SES + console transport). |
| `shared-types` | TS | DTOs / interfaces shared between Angular apps and Nest backends. |
| `ui-components` | TS | PrimeNG + Tailwind component library for admin/dev portals. |
| `sdk-node` | TS | Public Node SDK for WaveConnect APIs. |
| `sdk-go` | Go | Public Go SDK. |
| `proto` | proto | Protobuf definitions (identity ↔ authz gRPC contracts). |
| `nats` | Go | NATS client wrapper used by Go services. |
| `ratelimit` | Go | Redis token-bucket rate limiter (auth endpoints). |
| `telemetry` | Go | zerolog + tracing helpers. |

---

## Top-level directories

| Dir | Contents |
|---|---|
| `infra/` | Docker Compose for `sso-postgres` (5433), OpenFGA (8080/8081), NATS (4222), Redis (6379). K8s + Terraform stubs. |
| `database/` | Hand-written SQL migrations consumed by Go services (separate from admin-api's Prisma). |
| `openfga/` | FGA authorization model, bootstrap script (`scripts/bootstrap.sh`), `.store-id`, test cases. |
| `docs/` | API references, OpenAPI specs, conceptual docs. |
| `scripts/` | `smoke-routes.sh`, infra start-up helpers. |
| `packages/` | Reserved for publishable packages (currently mostly empty). |
| `sso-platform/` | Legacy / pre-Nx scaffolding. Treat as historical unless touching migration code. |
| `KT/` | Phase-by-phase knowledge-transfer docs. **Read these for product/design context.** |
| `R&D/` | Exploration notes, ERD, schema v2 drafts. |

---

## Auth flow (the thing this platform exists for)

### Consumer signup (tenantless)
1. `login-portal /signup` → `POST /auth/public/signup` → [signup.go](apps/identity-service/internal/service/signup.go) creates user + personal tenant + owner membership + `sso_session` cookie + verification email.
2. Click email link → `POST /auth/public/verify-email` → flips `users.status: pending_verification → active`.

### Org signup (Phase 2)
1. `login-portal /signup-org` → `POST /auth/public/signup-org` → [signup_org.go](apps/identity-service/internal/service/signup_org.go) atomically creates org tenant + admin user (status `pending_verification`) + owner membership + pending `tenant_domains` row + admin email-verification token.
2. Response includes TXT-record instructions — UI parks on `/signup-org/verify-domain`.
3. A worker (or `POST /api/v1/tenants/:id/domains/:id/verify`) checks DNS and marks the domain verified.
4. Admin clicks the verification email → user becomes `active` (gated separately from domain).

### Login (Phase 3, email-first)
1. `login-portal /login` step 1: `GET /auth/public/discover?email=…` → [discover.go](apps/identity-service/internal/handler/discover.go). Returns `mode: consumer | tenant_password | tenant_sso` + branded tenant + SSO IdP URL.
2. `tenant_sso` → full-page redirect to IdP via `sso-service`.
3. Otherwise step 2 collects password → `POST /auth/login`. **`X-Tenant-ID` must be the discovered tenant id** (raw uuid OR `ten_*` typeid — middleware accepts both, see [tenant.go](apps/identity-service/internal/middleware/tenant.go)).
4. If user has >1 membership → `redirectAfterAuth` diverts to `/select-tenant`.

### Active-tenant switching (Phase 5)
Sessions track `tenant_id` (anchor) and `active_tenant_id` (live). Switching flips `active_tenant_id` via [active_tenant.go](apps/identity-service/internal/service/active_tenant.go). Downstream services read `tenant_id` from session cookie as the active tenant.

---

## Cross-cutting infra

- **Postgres** at `localhost:5433` (container `sso-postgres`). Conn: `postgresql://postgres:postgres@localhost:5433/sso_dev`. Set via `DATABASE_URL` in [.env](.env).
- **RLS** — every request sets `SET LOCAL app.current_tenant_id = <uuid>` in [tenant.go middleware](apps/identity-service/internal/middleware/tenant.go). Policies on every tenant-scoped table enforce isolation.
- **OpenFGA** — REST 8080, gRPC 8081. Fresh envs need `./openfga/scripts/bootstrap.sh` once; store id is written to `openfga/.store-id` and must be copied into `apps/authz-service/config.yaml` or set as `OPENFGA_STORE_ID`.
- **NATS** at `:4222`. identity-service publishes `sso.events.*` (user_created, session_*, tenant_domain_verified, etc.); audit-service + authz-service subscribe.
- **Redis** at `:6379`. Session storage, refresh-token families, authz cache, rate-limit buckets.
- **Authz outbox pattern** — identity-service writes FGA tuple intents to `authz_outbox` inside the same tx as the domain mutation; authz-service drains the table. See [authz_outbox.go](apps/identity-service/internal/repository/authz_outbox.go) and [authz_tuple_helpers.go](apps/identity-service/internal/service/authz_tuple_helpers.go).
- **Tokens** — PASETO (v4). TTLs and keys in each service's `config.yaml`. The shared cookie is `sso_session` — cross-origin from frontends, so `withCredentials: true` is required on all Angular HTTP calls (handled by the credentials interceptor in [app.config.ts](apps/login-portal/src/app/app.config.ts)).

---

## Conventions to internalise

- **Typeid prefixes** — `user_*`, `ten_*`, `ses_*`, `mem_*`, `tok_*`. Defined in [apps/identity-service/internal/id/typeid.go](apps/identity-service/internal/id/typeid.go). Public APIs return the prefixed form. Middleware now accepts either prefixed or raw uuid for `X-Tenant-ID`.
- **`X-Tenant-ID` header is mandatory** on every request to identity-service. Falls back to JWT claim if absent; otherwise 400.
- **Login portal interceptor** — overrides `X-Tenant-ID` ONLY when no caller has set it. Per-call overrides (e.g. discover-driven login) must `new HttpHeaders({ 'X-Tenant-ID': … })` and pass through `{ headers }`.
- **Reactive primitives in Angular** — prefer `httpResource` / `toSignal` / `computed`. Reference implementations: `migration`, `select-tenant`, `invitation` components in `login-portal`.
- **Preview clicks under zoneless** — `preview_click` over CDP doesn't always trigger Angular's `(click)` listeners. Use `preview_eval` with `el.click()` to dispatch a real event (see CLAUDE.md).
- **Go services** — pre-compile with `go build -o /tmp/<svc> ./cmd/server` instead of `go run` to avoid Docker Desktop instability on this dev machine.
- **No `nx run-many` for serving** if you only need one service — Nx's lock will silently wait for the other invocation. Run individual `pnpm nx serve <project>` in dedicated terminals.

---

## Useful commands

```bash
# everything (frontends + backends, parallel=11)
pnpm serve:all
pnpm serve:frontend    # admin-console, developer-portal, login-portal
pnpm serve:backend     # all Nest + Go services (sources .env)

# individual app
pnpm nx serve identity-service
pnpm nx serve admin-api
pnpm nx serve login-portal

# Nx workspace ops
pnpm nx run-many --target=lint --all
pnpm nx run-many --target=test --all
pnpm nx affected -t build
pnpm nx graph                       # visual project dependency graph
pnpm nx show project login-portal   # inspect targets

# Go service direct build / run (Docker-friendly path)
cd apps/identity-service && go build -o /tmp/identity-service ./cmd/server && /tmp/identity-service

# Prisma (admin-api). Required on fresh checkout — otherwise admin-api crashes
# with "Cannot find module '.prisma/client/default'".
pnpm --filter @sso-platform/admin-api exec prisma generate
pnpm --filter @sso-platform/admin-api exec prisma migrate dev

# OpenFGA bootstrap (once per fresh env)
./openfga/scripts/bootstrap.sh
```

---

## Quick triage cheatsheet

| Symptom | Likely cause | Where to look |
|---|---|---|
| `{"error":"account disabled"}` on login | User is `pending_verification`. Click admin email link. | [auth.go:217](apps/identity-service/internal/handler/auth.go:217) — now returns `email_not_verified` for that case. |
| `{"error":"no membership in this tenant"}` | `X-Tenant-ID` is the dev default instead of the user's org tenant. | [auth.go:278](apps/identity-service/internal/handler/auth.go:278), [auth.store.ts login()](apps/login-portal/src/app/store/auth.store.ts), discover step. |
| `{"error":"invalid tenant ID format"}` | Sent `ten_*` typeid but old middleware expected raw uuid. | [tenant.go](apps/identity-service/internal/middleware/tenant.go) — `parseTenantID` now accepts both. |
| `:3100` connection refused / "Continuous" but nothing bound | admin-api crashed on boot (often Prisma client missing). | Run `prisma generate`; tail the actual serve log, not Nx's status line. |
| authz-service refuses to start | Missing OpenFGA store id. | `./openfga/scripts/bootstrap.sh`, then sync `apps/authz-service/config.yaml`. |
| Connection-refused on `::1:5433` from a Go service | Docker Desktop cycled the `sso-postgres` container. | Restart Docker Desktop / `docker compose up sso-postgres`. |

---

## Where to read next

- [CLAUDE.md](CLAUDE.md) — local-machine quirks and AI-agent operating rules.
- [OPERATIONS.md](OPERATIONS.md) — runbook for operating the stack.
- [KT/](KT/) — phase-by-phase product / design documentation.
- [apps/identity-service/internal/service/](apps/identity-service/internal/service/) — read top-of-file doc comments; they're the authoritative spec for each flow.
