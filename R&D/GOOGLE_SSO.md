# Google-Style Dual-Product Onboarding — `sso.wave-connect`

## Context

`sso.wave-connect` is today a B2B multi-tenant SSO platform. Signup and login require an `X-Tenant-ID` header because every request passes through `middleware.TenantExtraction` — which means there is **no way for an individual to self-serve a free personal account**, and orgs have no domain-ownership mechanism. The user wants a Google-style dual product: individuals can self-sign-up (consumer accounts, gmail-style), and organizations can verify a domain via DNS TXT to become a Workspace-style tenant that owns users on that domain. Pre-existing consumer users whose domain is later claimed get an opt-in migration flow.

**Core architectural decision:** every user belongs to a real tenant, including individuals. Consumer signup auto-creates a **personal tenant** (`tenant_kind='personal'`, `plan='free'`, `max_users=1`, slug `<slugified-name>-<random6>`). This avoids a 2–3 week RLS refactor that a nullable `tenant_id` would require, preserves every existing audit/session/isolation invariant, and matches Auth0 / Clerk / WorkOS precedent. Domain claim later moves memberships out of the personal tenant and soft-deletes it.

**Intended outcome after all phases:** an individual can visit `/signup`, create a personal account, verify email, and log in — all without any admin involvement. Separately, an org admin can visit `/signup-org`, enter a domain, get DNS TXT instructions, and after verification absorb existing consumer users on that domain via a 30-day-grace migration flow. Email-first login routing at `/login` sends visitors to the right place (consumer / tenant password / SSO IdP redirect).

---

## Recommended approach

### Phase 0 — Prerequisites (3 days)

Close two existing security holes and pick the email provider before any new flow is exposed.

**Security fixes.**
- `POST /api/v1/tenants` at [`apps/admin-api/src/tenants/tenants.controller.ts:34`](apps/admin-api/src/tenants/tenants.controller.ts) is currently unauthenticated. Add a new `PlatformAdminGuard` in `libs/nestjs-auth/src/guards/platform-admin.guard.ts` and apply it to the whole controller.
- Introduce `platform_admins` table (distinct from `memberships`, which is RLS-tenant-scoped).

**Migration `000018_platform_admins.up.sql`:**
```sql
CREATE TABLE platform_admins (
  user_id    UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('superadmin','support','readonly')),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes      TEXT
);
```
Bootstrap seed (migration `000019`) inserts one row from env `PLATFORM_BOOTSTRAP_EMAIL`, no-op if any row exists.

**Email provider: Amazon SES** (recommended — cheapest, fits AWS deployment). Abstract behind an `EmailProvider` interface in a new `libs/nestjs-email/` package so Postmark is a drop-in fallback later. Hbs templates live under `libs/nestjs-email/src/templates/`.

**Billing.** Out of scope. Reserve `tenants.stripe_customer_id VARCHAR(64)` column in migration `000020` so we never have to do a breaking migration later.

**Acceptance:** unauthenticated `POST /api/v1/tenants` returns 401/403; `PLATFORM_BOOTSTRAP_EMAIL` seed is idempotent on rerun; dev email-test endpoint delivers to Mailpit.

---

### Phase 1 — Individual signup (4 days)

Add a **tenantless public signup route** at `/auth/public/signup` that atomically creates `(personal tenant, user, owner membership, email-verification token)` and mints a session cookie. This runs in a new Fiber group registered **outside** the `TenantExtraction` middleware — following the precedent already set by `/logout` at [`apps/identity-service/cmd/server/main.go:171`](apps/identity-service/cmd/server/main.go).

**Migration `000021_email_verification.up.sql`:**
```sql
CREATE TABLE email_verification_tokens (
  token_hash  VARCHAR(64) PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email       CITEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON email_verification_tokens (user_id) WHERE consumed_at IS NULL;

CREATE TYPE tenant_kind AS ENUM ('personal','organization');
ALTER TABLE tenants ADD COLUMN tenant_kind tenant_kind NOT NULL DEFAULT 'organization';
```

**Reuse existing columns** (confirmed present in [`database/migrations/000003_core_identity.up.sql`](database/migrations/000003_core_identity.up.sql)):
- `users.email_verified` (line 91) — flipped to `TRUE` on verify
- `users.status` with `pending_verification` value (line 101) — flipped to `active` on verify

**API:**
- `POST /auth/public/signup` — body `{ email, password, display_name, locale?, timezone? }`. Checks (a) email unused, (b) domain not claimed in `tenant_domains` (table arrives in Phase 2 — until then returns false), (c) password ≥ 12 chars + upper/lower/number. Transactionally creates personal tenant, user, owner membership, verification token. Emits NATS `identity.user.created` via existing outbox pattern (migration `000012_authz_outbox`). Returns 201 + `sso_session` cookie.
- `POST /auth/public/verify-email` — body `{ token }`. Flips `email_verified=TRUE`, `status='active'`, marks token consumed.
- `POST /auth/public/verify-email/resend` — body `{ email }`. Returns 202 regardless of whether the email exists (enumeration resistance).

**Files to modify/create:**
- [`apps/identity-service/cmd/server/main.go`](apps/identity-service/cmd/server/main.go) — add `publicAuth := app.Group("/auth/public", middleware.PublicRateLimit(rdb))` after line 152 (CORS), before line 162 (tenant group).
- `apps/identity-service/internal/handler/signup_handler.go` — NEW.
- `apps/identity-service/internal/service/signup_service.go` — NEW, transactional orchestrator. Uses a service-role DB connection to bypass RLS during the pre-tenant-context bootstrap (or leverages the `000017_rls_coalesce` escape hatch).
- `apps/login-portal/src/app/app.routes.ts` — add `/signup` and `/verify-email` routes (current routes at [app.routes.ts](apps/login-portal/src/app/app.routes.ts) have `/register` but it's tenant-scoped — rename or deprecate).
- `libs/nestjs-email/src/templates/verify-email.hbs` — NEW.

**Failure modes:** slug collision (retry once with fresh random6); simultaneous email signup race (rely on `uq_users_email`); email send fails post-commit (use the resend endpoint, do NOT couple email to the transaction).

**Acceptance:** `POST /auth/public/signup` with fresh email → 201, cookie set, exactly 1 tenant/user/membership/token row created; repeat → 409; clicking link from Mailpit flips the flags.

---

### Phase 2 — Org signup + domain claim via DNS TXT (5 days)

`POST /auth/public/signup-org` creates an org tenant, admin user, owner membership, and a pending `tenant_domains` row with a `wave-connect-verify=<32hex>` TXT nonce. A verify endpoint plus a 10-minute cron worker walk pending rows using `net.LookupTXT`. The admin email's domain **must** equal the claimed domain.

**Migration `000022_tenant_domains.up.sql`:**
```sql
CREATE TABLE tenant_domains (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  domain             CITEXT NOT NULL,
  verification_token VARCHAR(48) NOT NULL,
  status             TEXT NOT NULL CHECK (status IN ('pending','verified','failed','expired')),
  is_primary         BOOLEAN NOT NULL DEFAULT FALSE,
  verified_at        TIMESTAMPTZ,
  last_checked_at    TIMESTAMPTZ,
  check_attempts     INTEGER NOT NULL DEFAULT 0,
  expires_at         TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  created_by         UUID REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX uq_tenant_domains_verified ON tenant_domains(domain) WHERE status='verified';
CREATE INDEX idx_tenant_domains_pending ON tenant_domains(last_checked_at) WHERE status='pending';
```

The existing `tenants.domain` column becomes display-only (not authoritative).

**API:**
- `POST /auth/public/signup-org` — public. Body `{ email, password, display_name, org_name, domain }`. eTLD+1 validation via a public-suffix list library.
- `POST /api/v1/tenants/:tenantId/domains` — authenticated (owner), add another domain.
- `POST /api/v1/tenants/:tenantId/domains/:id/verify` — authenticated, on-demand TXT lookup.
- Background cron (identity-service goroutine, 10 min): `SELECT ... WHERE status='pending' AND expires_at > NOW() ORDER BY last_checked_at LIMIT 200`, bounded concurrency (20 via `golang.org/x/sync/semaphore`).

On flip to `verified`, publish NATS `tenant.domain.verified { tenant_id, domain }` via outbox.

**Files:**
- `apps/identity-service/internal/dns/resolver.go` — NEW, wraps `net.Resolver{PreferGo:true}.LookupTXT` with 3s timeout.
- `apps/identity-service/internal/service/domains_service.go` — NEW.
- `apps/identity-service/internal/worker/domain_verify_worker.go` — NEW cron.
- `apps/admin-api/src/domains/` — NEW NestJS module; verify-domain endpoint delegates to identity-service over NATS or internal HTTP.
- `apps/login-portal/src/app/app.routes.ts` — add `/signup-org` and a `/signup-org/verify-domain` page showing the TXT instructions.

**Failure modes:** DNS recursor caching (record `last_checked_at`, surface "propagation can take up to 24h"); race between two tenants claiming same domain (partial unique index lets only one flip to `verified`); subdomain confusion (eTLD+1 only, explicit non-goal).

**Acceptance:** signup-org on `acme.test` creates pending row; mocked TXT `wave-connect-verify=<token>` flips to `verified` within a cron tick; second tenant claiming `acme.test` after verify returns 409.

---

### Phase 3 — Email-first login discovery (3 days)

Replace the single email+password login form (currently at `apps/login-portal/src/app/login/login.component.ts`) with a two-step Google-style flow. Step 1 enters email, Step 2 is chosen by `GET /auth/public/discover?email=<urlencoded>`.

**API:** `GET /auth/public/discover?email=...` returns:
```
{ mode: "consumer" | "tenant_password" | "tenant_sso",
  tenant?: { id, slug, name, logo_url, display_name },
  sso?:    { idp_id, authorize_url } }
```

Logic:
1. Extract domain from email.
2. Redis cache key `discover:domain:<domain>`, TTL 300s.
3. If tenant has `require_sso=true` (existing column `tenant_policies.require_sso`) AND an active row in `identity_providers`, return `tenant_sso` with IdP authorize URL.
4. Else if tenant claimed and password allowed, return `tenant_password`.
5. Else return `consumer` (domain unclaimed or user not found — enumeration-resistant).

**Anti-timing-oracle:** always wait a jittered 80–120ms before responding, so cache hit vs miss is indistinguishable.

**Files:**
- `apps/identity-service/internal/handler/discover_handler.go` — NEW.
- `apps/login-portal/src/app/login/login.component.ts` — split into email-step + password-step using a signal-driven state machine.
- `apps/login-portal/src/app/core/discover.service.ts` — NEW.

**Acceptance:** `gmail.com` → `consumer`; verified `acme.test` → `tenant_password` or `tenant_sso`; p95 warm cache <50ms.

---

### Phase 4 — Post-claim migration of consumer users (6 days)

When a domain verifies, a NATS consumer finds personal-tenant users on that domain and creates per-user migration offers with a 30-day grace window. Owners can force-migrate after grace, with a 7-day heads-up email.

**Migration `000023_tenant_domain_migrations.up.sql`:**
```sql
CREATE TABLE tenant_domain_migrations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_tenant_id     UUID NOT NULL REFERENCES tenants(id),
  to_tenant_id       UUID NOT NULL REFERENCES tenants(id),
  domain             CITEXT NOT NULL,
  status             TEXT NOT NULL CHECK (status IN ('offered','accepted','declined','force_moved','expired')),
  offered_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at       TIMESTAMPTZ,
  expires_at         TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  notification_token VARCHAR(64) NOT NULL,
  UNIQUE (user_id, to_tenant_id)
);
```

**Worker logic** (subscribed to `tenant.domain.verified` with queue group `migration-workers` for HA):
```sql
SELECT u.id FROM users u
  JOIN memberships m ON m.user_id = u.id
  JOIN tenants t    ON t.id = m.tenant_id
 WHERE split_part(u.email,'@',2) = $1
   AND t.tenant_kind = 'personal'
   AND u.deleted_at IS NULL
```
Create migration row per user, send `domain-migration-offer.hbs` email.

**API:**
- `POST /auth/public/migration/:token/accept` — moves owner membership from personal → org as `member`, soft-deletes the personal tenant (`tenants.deleted_at=NOW()` where `max_users=1 AND tenant_kind='personal'`), revokes all active sessions for that user (force re-login in org tenant).
- `POST /auth/public/migration/:token/decline` — status `declined`. User keeps personal tenant. Docs warn: if org later enables `require_sso`, password access will cut.
- `POST /api/v1/tenants/:id/domains/:domainId/migrations/:userId/force` — owner only; requires `expires_at < NOW()` OR `status='declined'`; sends 7-day heads-up email first (two-phase force).

**Files:**
- `apps/identity-service/internal/worker/migration_worker.go` — NEW.
- `apps/admin-api/src/domains/migrations.controller.ts` — NEW.
- `libs/nestjs-email/src/templates/domain-migration-offer.hbs` + `domain-migration-force-notice.hbs` — NEW.

**Failure modes:** user already a member of target org (skip offer, don't duplicate); MFA enrollments carry over since `mfa_enrollments` is user-scoped not tenant-scoped — confirm by inspection; outstanding OAuth2 grants to apps in the personal tenant are revoked on acceptance (surface in email).

**Acceptance:** verifying `acme.test` with existing `a@acme.test`, `b@acme.test` personal accounts → both get emails within 60s; accept moves membership + soft-deletes personal tenant; decline leaves state untouched; audit event `user.migration.declined` visible.

---

### Phase 5 — Multi-tenant session switcher (4 days)

Users in >1 tenant (e.g. kept personal + joined an org via invite) need to switch without re-login. Add `sessions.active_tenant_id` and a picker.

**Migration `000024_sessions_active_tenant.up.sql`:**
```sql
ALTER TABLE sessions ADD COLUMN active_tenant_id UUID REFERENCES tenants(id);
UPDATE sessions SET active_tenant_id = tenant_id;
ALTER TABLE sessions ALTER COLUMN active_tenant_id SET NOT NULL;
```
`sessions.tenant_id` stays as "session anchor" (login-time tenant); `active_tenant_id` is the live context. All RLS-critical reads switch to `active_tenant_id` — audit this in `apps/identity-service/internal/repository/session_repo.go`.

**API:**
- `GET /auth/session/memberships` — authenticated, returns all non-deleted memberships with tenant metadata.
- `PATCH /auth/session/active-tenant` — body `{ tenant_id }`. Validates membership exists, updates `sessions.active_tenant_id`, forces next PASETO refresh to mint claims for the new tenant.
- Login-portal: when `memberships.length > 1` post-login, show picker before routing to consent/redirect.

**Failure mode:** running OAuth2 auth-code flow embeds the old tenant. Store `tenant_id` inside the authorization code payload and ignore session switches during that flow.

**Acceptance:** user with 2 memberships sees picker; PATCH flips active tenant; `/api/v1/tenants/current` reflects the switch; cookie stays stable.

---

### Phase 6 — Wire email into existing admin invite (2 days)

The invite endpoint at [`apps/admin-api/src/memberships/memberships.controller.ts:39`](apps/admin-api/src/memberships/memberships.controller.ts) already creates the DB row but doesn't send email. Reuse existing columns `memberships.invitation_token` and `memberships.invitation_expires` (confirmed at [`000003_core_identity.up.sql:145-146`](database/migrations/000003_core_identity.up.sql)), populate them with a SHA-256 hashed 32-byte random token, send `invitation.hbs` email.

**API:**
- `POST /api/v1/memberships` (existing) — now generates token, sends email, sets 14-day expiry.
- `GET /auth/public/invitation/:token` — returns tenant branding + role being offered.
- `POST /auth/public/invitation/:token/accept` — body `{ password?, display_name? }` for new users; logs in existing users. Sets `memberships.joined_at`, clears `invitation_token`, emits `membership.accepted`.
- `POST /auth/public/invitation/:token/decline` — optional.

**Files:**
- `apps/admin-api/src/memberships/memberships.service.ts` — extend `invite()` to hash token + send email.
- `apps/identity-service/internal/handler/invitation_handler.go` — NEW public accept/decline.
- `libs/nestjs-email/src/templates/invitation.hbs` — NEW.

**Acceptance:** admin `POST /api/v1/memberships` sends email in dev; existing user accept → membership added + redirected to login; new user accept → prompts password setup then adds.

---

## Cross-cutting concerns

**Security.** All `/auth/public/*` endpoints bypass `TenantExtraction` and must individually enforce rate limits (reuse Redis sliding-window limiter); signup + resend + discover all return 202/consumer-mode on user-not-found for enumeration resistance; hCaptcha on signup and resend. `sso_session` stays HttpOnly/SameSite=Lax/Secure. CSRF-sensitive public endpoints (verify, migration accept) use GET confirmation page → POST mutation pattern. Platform-admin calls audit every request.

**Abuse prevention.** Per-IP (10/hr) + per-ASN (100/hr) buckets on signup; one personal tenant per user enforced via partial unique index `ON memberships(user_id) WHERE role='owner' AND tenant_id IN (SELECT id FROM tenants WHERE tenant_kind='personal')`; max 5 unverified `tenant_domains` per tenant, expired rows deleted after 60 days.

**Scaling.** `/auth/public/discover` is the hottest new path — Redis cache on domain, 95%+ hit rate expected; DNS verify cron bounded to 20 concurrent lookups; migration worker uses queue-group dedup via `UNIQUE(user_id, to_tenant_id)`.

**Audit events (new).** `user.signup.consumer`, `user.signup.org`, `tenant.domain.added`, `tenant.domain.verified`, `tenant.domain.expired`, `user.migration.offered`, `user.migration.accepted`, `user.migration.declined`, `user.migration.force_moved`, `session.active_tenant.switched`, `platform.tenant.created`, `invitation.sent`, `invitation.accepted`.

---

## Explicit non-goals

SAML self-serve configuration UI (still support-ticket driven); social login (Google/Microsoft/GitHub OAuth); guest/cross-tenant external collaborators; deliverability tuning beyond basic SPF/DKIM; billing / Stripe integration; subdomain-level claims (eTLD+1 only); per-region data-residency routing; A/B test rig for email-first login.

---

## Open product questions (surface to stakeholders before Phase 4)

1. **Grace period** — 30 days default; is 14 more enterprise-comfortable, or 60 less friction?
2. **Personal-tenant limits** — `max_users=1` fixed; max apps, max sessions, rate-limit differential?
3. **Rename on migration** — preserve user-chosen `display_name` or match org directory?
4. **Force-migration authority** — after 30 days, any owner can force — confirm.
5. **SSO-only lockout** — when org flips `require_sso=true`, do declined users lose password access immediately, after 30 days, or never?
6. **Billing provider** — Stripe vs Paddle (Merchant of Record) vs manual — shapes later column names.
7. **Multi-domain orgs** — one tenant, multiple verified domains — supported by schema; what's the UX default?
8. **Platform admin rotation ritual** — who owns `PLATFORM_BOOTSTRAP_EMAIL` rotation?

---

## Critical files (modify/create)

| Path | Action |
|---|---|
| [`apps/identity-service/cmd/server/main.go`](apps/identity-service/cmd/server/main.go) (line 162 area) | Add `/auth/public/*` group outside tenant middleware |
| [`apps/identity-service/internal/middleware/tenant.go`](apps/identity-service/internal/middleware/tenant.go) | Unchanged — new routes bypass it |
| [`apps/admin-api/src/tenants/tenants.controller.ts`](apps/admin-api/src/tenants/tenants.controller.ts) (line 34) | Phase 0 — apply `PlatformAdminGuard` |
| [`apps/admin-api/src/memberships/memberships.controller.ts`](apps/admin-api/src/memberships/memberships.controller.ts) (line 39) | Phase 6 — service wires email + token |
| [`database/migrations/000003_core_identity.up.sql`](database/migrations/000003_core_identity.up.sql) (lines 91, 101, 145–146) | Baseline: reuse `email_verified`, `status='pending_verification'`, `invitation_token`, `invitation_expires` |
| [`apps/login-portal/src/app/app.routes.ts`](apps/login-portal/src/app/app.routes.ts) | Add `/signup`, `/signup-org`, `/verify-email`, `/invitation/:token`, `/migration/:token` |
| [`apps/login-portal/src/app/login/login.component.ts`](apps/login-portal/src/app/login/login.component.ts) | Split into email-first + password step |
| `libs/nestjs-auth/src/guards/platform-admin.guard.ts` | NEW — Phase 0 |
| `libs/nestjs-email/` | NEW package — SES provider, hbs templates |
| `apps/identity-service/internal/handler/signup_handler.go` | NEW — Phase 1 |
| `apps/identity-service/internal/handler/discover_handler.go` | NEW — Phase 3 |
| `apps/identity-service/internal/handler/invitation_handler.go` | NEW — Phase 6 |
| `apps/identity-service/internal/service/signup_service.go` | NEW — Phase 1 transactional orchestrator |
| `apps/identity-service/internal/service/domains_service.go` | NEW — Phase 2 |
| `apps/identity-service/internal/dns/resolver.go` | NEW — Phase 2 TXT wrapper |
| `apps/identity-service/internal/worker/domain_verify_worker.go` | NEW — Phase 2 cron |
| `apps/identity-service/internal/worker/migration_worker.go` | NEW — Phase 4 NATS consumer |
| `apps/admin-api/src/domains/` | NEW module — Phase 2 + 4 |
| `apps/admin-api/src/platform-admins/` | NEW module — Phase 0 |
| Migrations `000018`–`000024` | NEW — see each phase |

---

## Verification

**Unit tests (per phase).**
- Phase 0: `PlatformAdminGuard` rejects non-admin; bootstrap migration is idempotent.
- Phase 1: signup creates exactly 1 tenant/user/membership/token; duplicate email returns 409; verify flips both `email_verified` and `status`.
- Phase 2: DNS resolver times out at 3s; verify flips to `verified` only when TXT matches; second claim on verified domain returns 409.
- Phase 3: discover returns `consumer` for unknown, `tenant_password` for claimed, `tenant_sso` when IdP active; constant-time jitter applied.
- Phase 4: worker creates migration rows for matching users, skips existing members; accept moves membership and revokes sessions.
- Phase 5: PATCH active-tenant rejects non-member tenants; active tenant persists across API calls.
- Phase 6: invite generates token hash, sends email; accept by new user creates password; accept by existing user logs them in.

**End-to-end (Playwright).**
- Add specs under `apps/login-portal-e2e/src/`:
  - `consumer-signup.spec.ts` — signup → check Mailpit → click verify → log in.
  - `org-signup.spec.ts` — signup-org → show TXT instructions → mock DNS → verify → log in.
  - `login-discovery.spec.ts` — unknown email → consumer mode; claimed email → tenant branding.
  - `migration-flow.spec.ts` — pre-create consumer user → admin verifies domain → accept migration email link → land in org.
  - `invitation.spec.ts` — admin invites → new user accepts → lands in org.
- Follow the existing `mockBackendAPIs` pattern from `apps/admin-console-e2e/src/support/mock-backend.ts` and `apps/developer-portal-e2e/src/support/mock-backend.ts` — add a similar helper under `apps/login-portal-e2e/src/support/` to mock identity-service endpoints when not running the full stack.
- Wire Mailpit (or MailHog) into the dev docker-compose for email capture.

**Manual smoke (full stack running).**
1. `pnpm nx run-many --target=serve` to boot all services.
2. Visit `http://localhost:4300/signup`, sign up as `individual@gmail.com`, click the Mailpit link, confirm redirect into personal workspace.
3. Visit `/signup-org`, sign up as `admin@acme.test` with org domain `acme.test`, copy TXT record.
4. Add TXT record to local DNS (via `dnsmasq` or a local resolver override) or stub the `Resolver` in dev.
5. Click "Verify now" in admin-console; confirm tenant gets marked verified.
6. Sign up another consumer as `user@acme.test` before verification; verify domain; confirm `user@acme.test` receives migration email; accept; confirm membership is now in Acme.
7. Log out; log in as `user@acme.test` → email-first routing lands on Acme's branded login.

**Lint + type check.** `pnpm lint:all` clean on all modified files; existing lint violations unchanged in count.

**Migration safety.** Each migration is transactional (single file, single `BEGIN/COMMIT`); all `ALTER` additions use `NOT NULL DEFAULT` or are added nullable then backfilled then tightened; no destructive changes.

---

## Estimate

| Phase | Days |
|---|---|
| 0 — Platform-admin + email infra | 3 |
| 1 — Consumer signup + verification | 4 |
| 2 — Org signup + domain claim | 5 |
| 3 — Email-first login discovery | 3 |
| 4 — Post-claim migration | 6 |
| 5 — Multi-tenant session switcher | 4 |
| 6 — Admin invite email wiring | 2 |
| **Total** | **27 engineering days** |

Phases 0, 1, 6 are mostly independent and can run in parallel across two engineers. Phase 3 depends on Phase 2's `tenant_domains` rows. Phase 4 depends on Phase 2's NATS event. Phase 5 is independent of everything after Phase 0.