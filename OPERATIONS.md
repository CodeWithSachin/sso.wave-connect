# Wave Connect — Operations Guide

This is the runbook for standing up, running, and operating Wave Connect (`sso.wave-connect`). It covers three audiences:

1. **Developers** running the platform locally for feature work.
2. **SREs** deploying it to staging / production.
3. **Tenant operators** creating orgs, inviting members, verifying domains, and wiring SSO.

If you're brand new, start at [Architecture](#architecture) → [Local quick start](#local-quick-start) → [Operator how-tos](#operator-how-tos).

---

## Architecture

Wave Connect is a multi-tenant identity platform: B2B SSO with a consumer tier bolted on ("dual product"). It's an Nx monorepo of 11 services under `apps/` plus shared libs under `libs/` and `packages/`.

```
┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐
│   login-portal     │  │   admin-console    │  │ developer-portal   │
│   (Angular 21)     │  │   (Angular 21)     │  │ (Angular 21)       │
│   :4300            │  │   :4301            │  │ :4302              │
└─────────┬──────────┘  └─────────┬──────────┘  └─────────┬──────────┘
          │                       │                       │
          └───────────────────────┼───────────────────────┘
                                  │                                     (sso_session cookie — HttpOnly, cross-app)
┌─────────────────────────────────▼─────────────────────────────────────────┐
│                           Backend services                                │
│  identity-service (Go, :3000) ── users, auth, sessions, tenants, domains, │
│                                  migrations, MFA                          │
│  sso-service (Go, :8083) ───── OAuth2 authorize/token/userinfo            │
│  authz-service (Go, :8082) ── ReBAC checks via OpenFGA                   │
│  admin-api (Nest, :3100) ── tenant mgmt: users, memberships, groups,     │
│                              identity providers, platform admins, policies│
│  developer-portal-api (Nest, :3500) ── API keys, OAuth apps, SCIM tokens │
│  directory-service (Nest, :3200) ──── SCIM v2 provisioning               │
│  audit-service (Nest, :3400) ── immutable audit log                      │
│  webhook-service (Nest, :3300) ── outbound webhook delivery              │
└─────────────────────────────────┬─────────────────────────────────────────┘
                                  │
┌─────────────────────────────────▼──────────────────────────────────────┐
│                          Infra (Docker Compose locally)                │
│  postgres:5433   redis:6379   openfga:8080/8081   nats:4222           │
└────────────────────────────────────────────────────────────────────────┘
```

Key design choices:
- **PASETO** session tokens issued by identity-service, stored server-side, fronted by an HttpOnly `sso_session` cookie shared across all three Angular apps.
- **OAuth2 + PKCE** from the Angular apps → sso-service for single sign-on.
- **OpenFGA (ReBAC)** for fine-grained authorization. Every authz decision goes through authz-service.
- **RLS per tenant** in Postgres (`SET LOCAL app.tenant_id = …`) for defense in depth.
- **NATS JetStream** outbox for async events (audit + webhooks).

---

## Prerequisites

Install these once, per machine:

| Tool | Version | Notes |
|---|---|---|
| Node.js | 20.19.9 (matches `devDependencies.@types/node`) | `nvm install 20.19` |
| pnpm | `corepack enable && corepack prepare pnpm@latest --activate` |
| Go | 1.22+ | Only needed to rebuild Go services from source |
| Docker Desktop | current | Runs Postgres / Redis / OpenFGA / NATS |
| `curl` + `jq` | any | Needed by `openfga/scripts/bootstrap.sh` |

Verify:
```bash
node -v && pnpm -v && docker version --format '{{.Server.Version}}'
```

---

## Environments

The repo supports four: **local dev**, **CI / ephemeral**, **staging**, **production**.

| Env | Provisioning | Runtime | Config source |
|---|---|---|---|
| Local dev | Docker Compose ([infra/docker/docker-compose.yml](infra/docker/docker-compose.yml)) | `pnpm nx serve <project>` | Repo `.env` + per-app `src/environments/environment.ts` |
| CI / ephemeral | `infra/docker/docker-compose.yml` in workflow | `pnpm nx run-many ...` | Same `.env` format, secrets from CI vault |
| Staging | Kubernetes via `infra/k8s/` + `infra/terraform/` | Helm charts / kustomize | `ConfigMap` + `Secret` per service |
| Production | Kubernetes via `infra/k8s/` + `infra/terraform/` | Same | `ConfigMap` + `Secret`, with HSM-backed PASETO key |

### Required environment variables

`.env` at the repo root (already checked in with local defaults):

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/sso_dev?schema=public"
REDIS_URL="redis://localhost:6379"
OPENFGA_API_URL="http://localhost:8080"
OPENFGA_GRPC_URL="localhost:8081"
NATS_URL="nats://localhost:4222"
```

Per-service variables each service expects (check each `apps/<name>/config.yaml` or `src/main.ts`):

| Variable | Services that read it | Example |
|---|---|---|
| `PASETO_SYMMETRIC_KEY_HEX` | identity-service, sso-service | 64 hex chars |
| `OPENFGA_STORE_ID` | authz-service | UUID from `openfga/.store-id` |
| `SESSION_COOKIE_DOMAIN` | identity-service | `.wave-connect.local` (dev), `.waveconnect.com` (prod) |
| `SMTP_*` | identity-service | For email verification + invitations |
| `COOKIE_SECURE` | identity-service | `true` in staging/prod |

### Per-app frontend environment

Each Angular app has `src/environments/environment.ts` and `environment.prod.ts`. Change these when service URLs differ per env:

```ts
// apps/admin-console/src/app/environments/environment.ts
export const environment = {
  production: false,
  adminApiUrl: 'http://localhost:3100',
  identityServiceUrl: 'http://localhost:3000',
  ssoServiceUrl: 'http://localhost:8083',
  // ...
  loginPortalUrl: 'http://localhost:4300/login',
};
```

In production, point these at your real hostnames (e.g. `https://id.waveconnect.com`).

---

## Local quick start

### 1. Clone + install

```bash
git clone <repo>
cd sso.wave-connect
pnpm install
```

### 2. Start infrastructure

```bash
docker compose -f infra/docker/docker-compose.yml up -d
```

This starts:
- `postgres:5433` with database `sso_dev` (auto-init from [`infra/docker/postgres/init.sql`](infra/docker/postgres/init.sql))
- `redis:6379`
- `openfga:8080` (HTTP) and `:8081` (gRPC)
- `nats:4222`

Wait for health:
```bash
docker compose -f infra/docker/docker-compose.yml ps
```

### 3. Bootstrap OpenFGA

Fresh environments need an OpenFGA store + authorization model before authz-service will boot:

```bash
./openfga/scripts/bootstrap.sh
```

This is **idempotent**. It:
- Creates (or reuses) a store named `sso-wave-connect`.
- Loads `openfga/model.fga` as the latest authz model.
- Writes the store id to `openfga/.store-id` (git-ignored).

Copy that store id into whichever of these the authz-service reads:
- `apps/authz-service/config.yaml` → `openfga.store_id`
- or env: `export OPENFGA_STORE_ID=$(cat openfga/.store-id)`

### 4. Run Prisma migrations

```bash
pnpm nx run admin-api:prisma:migrate-dev
# Repeat for any other Nest service that owns a Prisma schema.
```

### 5. Start the stack

Three options depending on what you need running:

```bash
# Everything — 3 frontends + 8 backends in parallel
pnpm serve:all

# Just the Angular apps (handy if backends already run in Docker/IDE)
pnpm serve:frontend

# Just the backend services
pnpm serve:backend
```

One service at a time:
```bash
pnpm nx serve login-portal        # http://localhost:4300
pnpm nx serve admin-console       # http://localhost:4301
pnpm nx serve developer-portal    # http://localhost:4302
pnpm nx serve identity-service    # http://localhost:3000
pnpm nx serve sso-service         # http://localhost:8083
# ...etc. Every project in `pnpm nx show projects` is runnable this way.
```

### 6. Smoke test

```bash
# Frontends respond
curl -sI http://localhost:4300/login   # expect 200
curl -sI http://localhost:4301         # expect 200
curl -sI http://localhost:4302         # expect 200

# Backends respond
curl -s  http://localhost:3000/healthz           # {"status":"ok"}
curl -s  http://localhost:8083/.well-known/openid-configuration | jq .
curl -sI http://localhost:3100/api/v1/users      # 401 = service up + requiring auth
```

### Port map (local defaults)

| Port | Service |
|---|---|
| 4300 | login-portal |
| 4301 | admin-console |
| 4302 | developer-portal |
| 3000 | identity-service |
| 3100 | admin-api |
| 3200 | directory-service |
| 3300 | webhook-service |
| 3400 | audit-service |
| 3500 | developer-portal-api |
| 8082 | authz-service |
| 8083 | sso-service |
| 5433 | postgres |
| 6379 | redis |
| 8080 / 8081 | OpenFGA HTTP / gRPC |
| 4222 / 8222 | NATS client / monitoring |

---

## Staging & production

Infrastructure manifests live in `infra/k8s/` (kustomize) and `infra/terraform/`.

### Deployment shape

- Each backend runs as its own Deployment with an independent HPA.
- Postgres is managed (RDS / Cloud SQL), not in-cluster.
- OpenFGA runs in-cluster with the shared Postgres as its datastore.
- NATS runs as a StatefulSet.
- Angular apps are built to static assets and served from a CDN. Their `environment.prod.ts` points at your real hostnames — typically `https://id.<domain>`, `https://sso.<domain>`, `https://admin.<domain>`, etc.

### Build for production

```bash
pnpm build:all                                   # every project
pnpm nx build admin-console --configuration=production
```

Output lands under `dist/apps/<name>/`. CI uploads these to S3 / GCS / Cloudflare R2 and invalidates the CDN.

### Per-service secrets

Set in your secret manager (AWS Secrets Manager / GCP Secret Manager / Vault):

- `PASETO_SYMMETRIC_KEY_HEX` — rotate quarterly, use an HSM if possible.
- `DATABASE_URL` — managed Postgres connection string with SSL.
- `OPENFGA_STORE_ID` — output of `./openfga/scripts/bootstrap.sh` against your prod FGA instance.
- `SMTP_*` — transactional email provider creds.
- `COOKIE_SECURE=true`, `SESSION_COOKIE_DOMAIN=.<your-domain>`.

### Health / readiness

Every Go service exposes `/healthz` (liveness) and `/readyz` (readiness — checks DB, NATS, OpenFGA). Every Nest service exposes `/api/docs` (Swagger). Wire those into your K8s probes.

---

## Day-2 operations

### Tail logs

```bash
# Local — one service
pnpm nx serve identity-service

# Docker infra
docker compose -f infra/docker/docker-compose.yml logs -f postgres
```

### Reset local database

```bash
docker compose -f infra/docker/docker-compose.yml down -v      # wipes volumes
docker compose -f infra/docker/docker-compose.yml up -d
./openfga/scripts/bootstrap.sh
pnpm nx run admin-api:prisma:migrate-dev
```

### Rebuild OpenFGA model

```bash
./openfga/scripts/validate.sh     # validates openfga/model.fga
./openfga/scripts/migrate.sh      # uploads a new model version
```

### Rotate PASETO signing key

1. Generate a new symmetric key: `openssl rand -hex 32`.
2. Set it on identity-service + sso-service as `PASETO_SYMMETRIC_KEY_HEX`.
3. Roll both services. Existing sessions signed with the old key will be rejected — users re-auth.
4. Schedule the roll off-hours to minimise user pain.

---

# Operator how-tos

The bits below assume the stack is running. Each feature lists: the UI path, the HTTP endpoints behind it, and any CLI alternative.

## 1. Create an organization (tenant)

Two paths depending on whether the creator has an existing account.

### A. Self-serve org signup (no existing account)

1. User visits `http://localhost:4300/signup-org`.
2. Enters org name, display name, primary domain, admin email + password.
3. Frontend calls `POST /auth/public/signup-org` on identity-service. Backend:
   - Creates tenant, creates user, sets membership = `owner`, issues sso_session.
   - Queues a domain-verification TXT record for the primary domain.
4. User is redirected to `/signup-org/verify-domain` with DNS instructions.
5. Add a TXT record at the shown host with the shown value.
6. Click "Check now" (or let the 10-min cron poll) — the frontend calls `POST /tenants/:tenantId/domains/:id/verify`.
7. Once verified, the org is usable for SSO discovery.

### B. Platform-admin provisioning

For orgs being migrated in or sold manually:

```bash
curl -X POST http://localhost:3100/api/v1/tenants \
  -H "Content-Type: application/json" \
  --cookie "sso_session=<platform-admin-session>" \
  -d '{"name":"acme","displayName":"Acme Inc.","primaryDomain":"acme.test"}'
```

This is gated by the `platformAdmin` role — assign that first via `POST /api/v1/platform/admins`.

## 2. Consumer signup (individual account)

For individual (non-org) users:

1. User visits `http://localhost:4300/signup`.
2. Frontend calls `POST /auth/public/signup` — the backend creates a `personal` tenant with `max_users=1` so every user has a real tenant.
3. Verification email is queued. The link lands at `/verify-email?token=…`.
4. Clicking it calls `POST /auth/public/verify-email`. After that, the user can sign in normally.

## 3. Email-first login with discovery

The login flow implements Google-style email-first discovery:

1. `/login` → user types email → `GET /auth/public/discover?email=...` (rate-limited).
2. Response mode:
   - `consumer` — show password field with default branding.
   - `tenant_password` — show password field with the tenant's logo + name.
   - `tenant_sso` — full-page redirect to the configured IdP.
3. Password submit → `POST /auth/login` with tenant context → 200 + `Set-Cookie: sso_session=…`.
4. After login, the login portal redirects based on `?return_to=` (if present) or the new `defaultPostLoginUrl` fallback.

See [apps/login-portal/src/app/login/login.component.ts](apps/login-portal/src/app/login/login.component.ts) for the flow and [apps/login-portal/src/app/store/auth.store.ts](apps/login-portal/src/app/store/auth.store.ts) for the redirect logic.

## 4. Invite a member

From the admin console:

1. Log in as a tenant owner or admin.
2. Navigate to **Members** → **Invite member**.
3. Enter email + role (`member` / `admin`) + optional group.
4. Frontend calls `POST /api/v1/memberships` on admin-api. Backend:
   - Creates a pending invitation row (token + expiry).
   - Sends an email containing `http://localhost:4300/invitation/<token>`.

For the invitee:

1. They click the link, landing on `/invitation/:token` in the login portal.
2. Frontend calls `GET /auth/public/invitation/:token` to display tenant info and role.
3. New user? Submit to `POST /auth/public/invitation/:token/accept` to create the account and join.
4. Existing user? Sign in first, then the same POST adds the membership.

## 5. Verify a domain

Domains must be verified before they can be used for SSO / email-first discovery / migration.

1. Admin console → **Domains** → **Add domain** → enter `foo.example.com`.
2. UI calls `POST /tenants/:tenantId/domains`. Backend returns a TXT record value (`wave-connect-verify=...`).
3. Add the TXT record at your DNS provider.
4. Admin console → **Check now** (or let the cron run every 10 min).
5. UI calls `POST /tenants/:tenantId/domains/:id/verify`. If DNS resolves to the expected value, the domain flips to verified.

DNS changes take up to 24 hours to propagate — the UI surfaces this caveat.

## 6. Configure SSO (IdP)

Wire an external identity provider (SAML or OIDC):

```bash
# SAML
curl -X POST http://localhost:3100/api/v1/identity-providers/saml \
  --cookie "sso_session=…" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Acme Okta",
    "metadataUrl": "https://acme.okta.com/app/<id>/sso/saml/metadata",
    "attributeMapping": {"email":"mail","firstName":"givenName","lastName":"sn"}
  }'

# OIDC
curl -X POST http://localhost:3100/api/v1/identity-providers/oidc \
  --cookie "sso_session=…" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Corp Google",
    "issuer": "https://accounts.google.com",
    "clientId": "...",
    "clientSecret": "...",
    "scopes": ["openid","email","profile"]
  }'
```

List / inspect / update / delete via the other endpoints on [idp.controller.ts](apps/admin-api/src/identity-providers/idp.controller.ts):
- `GET /api/v1/identity-providers` — list
- `GET /api/v1/identity-providers/:id` — details
- `PATCH /api/v1/identity-providers/:id` — update
- `DELETE /api/v1/identity-providers/:id` — remove

Once an IdP is active for a verified domain, any email matching that domain lands on `tenant_sso` during discovery and goes through the IdP.

## 7. Groups

Organize members into hierarchical groups. From admin-api ([groups.controller.ts](apps/admin-api/src/groups/groups.controller.ts)):

| Action | Endpoint |
|---|---|
| Create group | `POST /api/v1/groups` |
| List groups | `GET /api/v1/groups` |
| Get group | `GET /api/v1/groups/:id` |
| Delete group | `DELETE /api/v1/groups/:id` |
| Add member | `POST /api/v1/groups/:id/members` |
| Remove member | `DELETE /api/v1/groups/:id/members/:userId` |
| Add subgroup | `POST /api/v1/groups/:id/children` |
| Remove subgroup | `DELETE /api/v1/groups/:id/children/:childGroupId` |

## 8. Tenant switcher

Users with memberships in multiple tenants land on `/select-tenant` after login. Programmatically:

```bash
# List memberships for the current session
curl http://localhost:3000/auth/session/memberships \
  --cookie "sso_session=…"

# Switch active tenant
curl -X PATCH http://localhost:3000/auth/session/active-tenant \
  --cookie "sso_session=…" \
  -H "Content-Type: application/json" \
  -d '{"tenantId":"<uuid>"}'
```

The sso_session cookie stays the same — only the bound `active_tenant_id` on the session row changes.

## 9. Migrations (post-claim ownership transfer)

When a consumer tier user's email matches a freshly-verified org domain, they get a 30-day notice to either move their personal account into the org or keep it separate. Admin side:

- `GET /tenants/:tenantId/migrations` — list pending / accepted / declined / forced
- `POST /tenants/:tenantId/migrations/:id/notify-force` — remind the user we're about to force
- `POST /tenants/:tenantId/migrations/:id/force` — admin override after grace period

User side (token-bound, in the login portal):

- `GET /auth/public/migration/:token` — lookup
- `POST /auth/public/migration/:token/accept` → joins the org, preserves data
- `POST /auth/public/migration/:token/decline` → keeps the personal tenant, their email will eventually need to change

## 10. OAuth2 applications (for third-party integrations)

Developer portal → **OAuth Apps** → **New app**.

| Action | Endpoint (developer-portal-api) |
|---|---|
| Create | `POST /api/v1/oauth-apps` |
| List | `GET /api/v1/oauth-apps` |
| Rotate secret | `POST /api/v1/oauth-apps/:id/rotate-secret` |
| Delete | `DELETE /api/v1/oauth-apps/:id` |

Apps are issued a `client_id` + `client_secret` for the Authorization Code + PKCE flow against `sso-service:8083`.

## 11. API keys (for server-to-server)

Developer portal → **API Keys** → **Generate key**. Paste into server env.

| Action | Endpoint |
|---|---|
| Create | `POST /api/v1/api-keys` |
| List | `GET /api/v1/api-keys` |
| Get | `GET /api/v1/api-keys/:id` |
| Revoke | `DELETE /api/v1/api-keys/:id` |
| Usage stats | `GET /api/v1/api-keys/:id/usage` |

Keys are shown **only once** at creation — store them immediately.

## 12. SCIM 2.0 provisioning

Hand the SCIM token + base URL to your IdP (Okta / Azure AD / Google). They call directory-service at `:3200`:

- Create token: `POST /api/v1/scim-tokens` (developer-portal-api)
- Users: `GET|POST|GET /scim/v2/Users[/:id]`
- Groups: `GET|POST|GET /scim/v2/Groups[/:id]`

Sync logs visible at `GET /api/v1/scim-tokens/sync-logs`.

## 13. Webhooks

Register endpoints that receive `user.created`, `membership.updated`, `tenant.domain.verified`, etc.

| Action | Endpoint (webhook-service) |
|---|---|
| Create endpoint | `POST /api/v1/webhooks` |
| List endpoints | `GET /api/v1/webhooks` |
| Delete endpoint | `DELETE /api/v1/webhooks/:id` |
| List deliveries | `GET /api/v1/webhooks/:endpointId/deliveries` |
| Inspect delivery | `GET /api/v1/webhooks/:endpointId/deliveries/:deliveryId` |
| Retry | `POST /api/v1/webhooks/:endpointId/deliveries/:deliveryId/retry` |

Events are published by services onto NATS JetStream; webhook-service consumes and delivers with HMAC signatures and exponential backoff.

## 14. Audit log

Every state-changing action is audited. Read it via the admin console's **Audit log** tab, or:

```bash
curl "http://localhost:3400/api/v1/audit-logs?page=1&pageSize=50&startDate=2026-04-01T00:00:00Z" \
  --cookie "sso_session=…"
```

Logs are append-only in Postgres with row-level checksums.

## 15. Tenant policies

Admin console → **Policies** or:

```bash
curl http://localhost:3100/api/v1/settings/policies --cookie "sso_session=…"

curl -X PATCH http://localhost:3100/api/v1/settings/policies \
  --cookie "sso_session=…" \
  -H "Content-Type: application/json" \
  -d '{
    "passwordMinLength": 12,
    "requireMfa": true,
    "sessionMaxAgeMinutes": 480,
    "allowedDomains": ["acme.test"]
  }'
```

## 16. MFA enrollment

Authenticated users can enroll TOTP or WebAuthn:

- `POST /auth/mfa/enroll` — start TOTP
- `POST /auth/mfa/enroll/:id/verify` — confirm TOTP
- `GET /auth/mfa/enrollments` — list
- `DELETE /auth/mfa/enrollments/:id` — remove
- `POST /auth/mfa/backup-codes/regenerate`
- `POST /auth/mfa/webauthn/register/begin` + `.../complete`
- `POST /auth/mfa/webauthn/login/begin` + `.../complete` (unauth — called during login after password accepted)

When a tenant's policy flips `requireMfa=true`, users are forced into the MFA challenge on next login.

## 17. Logout

From any authenticated app (admin-console or developer-portal), the sidebar Sign-out button:

1. `POST http://localhost:3000/auth/logout` → revokes the session row + clears the `sso_session` cookie.
2. Clears `sessionStorage` (idToken + PKCE artifacts).
3. Redirects to `http://localhost:4300/login?return_to=<current-dashboard-url>` so the login portal can send the user back after re-auth.

See [LOGOUT fix notes](#) — bouncing to `/` instead triggered the OAuth guard, which would silently re-auth via a still-live cookie and land the user right back on the dashboard. The current behavior guarantees an unambiguous signed-out surface.

---

## Troubleshooting

| Symptom | Most likely cause | Fix |
|---|---|---|
| `connection refused` on `:5433` | Docker Desktop cycled (see [CLAUDE.md](CLAUDE.md)) | Restart Docker, retry. |
| `invalid store id` on authz-service boot | Forgot OpenFGA bootstrap | `./openfga/scripts/bootstrap.sh`, set `OPENFGA_STORE_ID`. |
| 401 loop on admin-console | Expired `sso_session` cookie + stale `idToken` | We now redirect to login portal instead of `/`. If still looping, clear browser storage + cookies. |
| "logout didn't work" | `/` redirect re-triggered OAuth (fixed) | Confirm you're on the current build; logout handler should point at `environment.loginPortalUrl`. |
| SCIM 401 | SCIM token revoked / expired | Regenerate in developer portal. |
| Email not arriving | SMTP creds / sandboxing | Check identity-service logs for `mail: send failed`. Mailpit / Mailhog locally. |
| `net::ERR_CONNECTION_REFUSED` on frontends | Frontend dev server not bound on 0.0.0.0 | Use `http://localhost:...` (IPv6) or edit `project.json` to bind `--host=0.0.0.0`. |
| Session cookie not being sent cross-origin | `SESSION_COOKIE_DOMAIN` wrong | Set to a common suffix of all app hostnames. Local dev: edit `/etc/hosts` to use a shared domain. |

---

## Useful commands cheat-sheet

```bash
# Stack
pnpm serve:all                      # everything
pnpm serve:frontend                 # Angular apps only
pnpm serve:backend                  # API services only
pnpm nx serve <project>             # one service
pnpm nx run-many --target=test --all
pnpm nx affected --target=build

# Infra
docker compose -f infra/docker/docker-compose.yml up -d
docker compose -f infra/docker/docker-compose.yml down -v
./openfga/scripts/bootstrap.sh
./openfga/scripts/validate.sh

# Build
pnpm build:all
pnpm nx build admin-console --configuration=production

# Lint / test
pnpm lint:all
pnpm test:all

# Project list
pnpm nx show projects
```

---

## References

- [CLAUDE.md](CLAUDE.md) — workspace conventions (zoneless Angular, preview quirks, Docker instability).
- [docs/quickstart/](docs/quickstart/) — Go and Node SDK quick starts.
- [openfga/model.fga](openfga/model.fga) — authz model (relations, types).
- [infra/docker/docker-compose.yml](infra/docker/docker-compose.yml) — local infra.
- [apps/<service>/README.md](apps/) — per-service docs (when present).
