# Deferred Roadmap — Post-ADR-0002 Follow-ups

**Last updated:** 2026-05-16
**Owner:** Backend + Frontend
**Status:** Plan — none of the items below are started
**Predecessors:** ADR-0002 (unified RBAC) shipped, E2E review batch shipped (A1 verification, A3 seed, A5–A8 fixes, B1/B2 wiring, D1–D6 UI fixes)

This plan covers six follow-up items that were intentionally deferred while
landing the security and UX gaps surfaced in the May 16 end-to-end review.
Each item is independently shippable; phasing is a recommendation, not a
hard ordering.

---

## What's already in place (so you don't re-derive it)

- **`Capability` union** lives in `libs/shared-types/src/lib/enums.ts`.
  Originally 13 strings spanning platform / tenant-admin / developer tiers;
  Item 1.2 added 4 `read_*` caps for a current total of 17.
- **`computeCapabilities(input)`** at `libs/nestjs-auth/src/lib/capabilities.ts`
  is the single source of truth; 12 vitest cases cover the matrix.
- **`@RequireCapability(...caps)` decorator** + `RequireCapabilityGuard`
  global APP_GUARD on both NestJS services (admin-api, developer-portal-api).
- **`@RequireVerifiedEmail()` decorator** + `RequireVerifiedEmailGuard`
  global APP_GUARD applied to every write controller on both NestJS services.
- **`emitGuardAuditEvent`** in `libs/nestjs-auth/src/lib/guard-audit.ts`
  fires `rbac.capability_denied` / `rbac.email_not_verified` rows to the
  partitioned `audit_logs` table on every rejection (best-effort).
- **Angular `SessionStore`** in each console polls `GET /api/v1/session/me`
  every 30 s. `withHooks.onInit → _startPolling()`.
- **`requireCapability(...)` route guard** + capability-denied toast pattern
  in both consoles.
- **`SearchService` bus** wired in both consoles. Members consumes it
  (admin-console); api-keys + oauth-apps consume it (developer-portal).
- **OpenFGA shipped but unused** — `authz-service` running, gRPC + REST
  surfaces both alive, `openfga/model.fga` modelling `organization`,
  `application`, etc. No NestJS code calls `Check()` today; the
  `RebacGuard` exists at `libs/nestjs-auth/src/lib/rebac.guard.ts` but
  no controller decorator routes through it. `authz_outbox` table is
  the buffer.
- **ADR-0003 stub** at `docs/architecture/adr-0003-openfga.md` captures
  triggers + sketch.

---

## Phase 1 — Small wins (1–2 days total)

### Item 1.1 — Bundle-size budget bump for admin-console

**Current state:** admin-console initial bundle is 558 KB; the Nx target
caps it at 500 KB and emits a warning every build. Same lint output
since at least the post-A1 batch (58 KB over). Largely PrimeNG + Nora
theme + heroicons.

**Decision:** raise the budget to **650 KB initial / 1 MB max**, NOT
optimize. Premature for the use case (internal admin tool, not consumer
web) and the warnings drown out other compile diagnostics. Re-evaluate
when admin-console crosses 1 MB.

**Files:**
- `apps/admin-console/project.json` — `build.configurations.production.budgets`
- Confirm developer-portal isn't also flagged (currently within budget).

**Acceptance:** `pnpm nx build admin-console` exits 0 with no
"exceeded maximum budget" warning. No bundle-size regression check in
CI today; if one lands later, the new ceiling becomes the gate.

**Out of scope:** route-level code splitting (PrimeNG components are
already lazy-imported per feature), webpack-bundle-analyzer run
(useful but separate).

---

### Item 1.2 — Capability vocabulary split (read vs write tiers)

**Current state:** today `manage_api_keys` gates both read and write
on api-keys controllers; same for `manage_oauth_apps`, `manage_webhooks`,
`manage_members`. The split exists informally (we have
`view_developer_resources` for the read-only viewer tier, and reads use
`view_tenant_settings` / `view_audit_log` elsewhere), but the writeful
caps are overloaded.

**Decision:** split each writeful cap into a `read_*` + `manage_*`
pair where it improves the role matrix. **Don't blow up the union
just because we can** — only split where there's a real role that
should see-but-not-touch.

| Today | Split into | Why |
|---|---|---|
| `manage_api_keys` | `read_api_keys`, `manage_api_keys` | `billing_manager` should see usage costs but not rotate keys |
| `manage_oauth_apps` | `read_oauth_apps`, `manage_oauth_apps` | same — read for audit/billing roles |
| `manage_webhooks` | `read_webhooks`, `manage_webhooks` | webhooks expose business events; read-only is meaningful |
| `manage_members` | `read_members`, `manage_members` | a `readonly` org member should be able to see the team list |
| `manage_invitations` | (keep single) | invitation list is a tenant-admin surface only |
| `manage_scim_tokens` | (keep single) | already admin-only by design |

After the split: union goes from 13 → 17 strings. (Earlier plan revisions
quoted 18 → 22; the audit ahead of implementation found 13 base caps, not
18. Total after the four-cap split is 17.)

Item 1.2 additionally folded the webhook-service decorator gap (no
`@RequireCapability` on any of its 5 endpoints) into the same commit:
`RequireCapabilityGuard` is now wired into webhook-service's APP_GUARD
chain, and the two user-facing controllers (`endpoints`, `deliveries`)
carry `@RequireCapability('read_webhooks' | 'manage_webhooks')`.
`internal-dispatch` deliberately stays un-decorated; its service-to-service
auth model is unresolved and was flagged as out of scope for Item 1.2.

**Files:**
- `libs/shared-types/src/lib/enums.ts` — add `read_api_keys`,
  `read_oauth_apps`, `read_webhooks`, `read_members` to `Capability` union
- `libs/nestjs-auth/src/lib/capabilities.ts` — extend the matrix:
  - `read_api_keys` / `read_oauth_apps` / `read_webhooks` → every active
    membership (including `readonly` and `billing_manager`)
  - `read_members` → every active membership in an `organization` tenant
- `libs/nestjs-auth/src/lib/capabilities.spec.ts` — extend the existing
  vitest cases to assert the new caps on every role
- `apps/developer-portal-api/src/{api-keys,oauth-apps}/*.controller.ts` —
  change `@RequireCapability('view_developer_resources')` on GET routes
  to `@RequireCapability('read_api_keys')` etc. Writes already use
  `manage_*`, no change.
- `apps/admin-api/src/users/users.controller.ts`,
  `memberships.controller.ts`, `groups.controller.ts` — change GET
  decorators to `@RequireCapability('read_members')`
- `apps/admin-console/src/app/app.routes.ts` — relax `/members`,
  `/groups` route guards from `manage_members` to
  `requireCapability(['read_members', 'manage_members'])` (union)
- Same for developer-portal's `/api-keys`, `/oauth-apps`, `/webhooks`
- `apps/admin-console/src/app/layout/layout.component.ts` and
  `apps/developer-portal/src/app/layout/layout.component.ts` —
  navItems[].caps arrays use the new read-tier caps
- `docs/architecture/rbac.md` — update the capability table

**Acceptance:** `vitest` for the 12 + 8 cases stays green; the matrix
tests assert new caps; a `readonly` user can curl `GET /api/v1/api-keys`
(200) and `POST` (403); same for members on org tenants.

**Risks:**
- Backward-compat for the 5 dev caps already in production scripts /
  external integrations. **Keep the old caps in the matrix** — they
  imply the new read caps. Adding `read_*` is purely additive.
- `view_developer_resources` becomes vestigial. Keep it; it gates
  `/dashboard` for the developer-portal so any active member sees the
  shell. Future cleanup: drop in a separate pass.

---

### Item 1.3 — Admin-console search bus on groups + audit list pages

**Current state:** Members component consumes `SearchService.query()`
(unioned with its local search input). Groups and Audit don't — typing
in the top-bar search filters nothing on those pages.

**Files:**
- `apps/admin-console/src/app/features/groups/groups.component.ts` —
  inject `SearchService`; add a `filteredGroups()` computed mirroring the
  members pattern; switch the template's `@for` loop to use it
- `apps/admin-console/src/app/features/audit/audit.component.ts` — same
  pattern but searching across `action`, `actorId`, `resourceType`,
  `description`

**Acceptance:** Type "auth" in the top-bar; Groups shows only groups
whose name contains "auth"; Audit shows only events whose action or
resource matches.

**Out of scope:** debounce. The signal-based filter is already cheap
enough that debounce adds latency without measurable benefit.

---

## Phase 2 — Server-side search aggregator (2–3 days)

### Item 2.1 — Backend search endpoint

**Current state:** client-side filtering only works against the
already-loaded page (≤20 rows). A user searching for "alice" sees
nothing if Alice is on page 4. The pattern is broken for any tenant
with >20 of anything.

**Decision:** add **per-resource search params** to existing list
endpoints (`?search=alice`) and aggregate them client-side into a
results panel. NOT a Postgres full-text index — start with `ILIKE`
on the indexed columns. Move to FTS or Meilisearch if perf needs it.

**Backend changes:**

| Service | Endpoint | Search columns |
|---|---|---|
| admin-api | `GET /api/v1/users?search=` | email, display_name, first_name, last_name |
| admin-api | `GET /api/v1/groups?search=` | name, description |
| admin-api | `GET /api/v1/memberships?search=` | user.email, user.display_name |
| audit-service | `GET /api/v1/audit-logs?search=` | action, description, resource_id |
| developer-portal-api | `GET /api/v1/api-keys?search=` | name, key_prefix |
| developer-portal-api | `GET /api/v1/oauth-apps?search=` | name, client_id |

**Implementation pattern (NestJS):**
```ts
@Query('search') search?: string;
// in service:
where: search ? { OR: [...COLUMNS.map(c => ({ [c]: { contains: search, mode: 'insensitive' } }))] } : undefined
```

Cap `search.length` at 200 chars (server-side validation).

**Frontend — global search panel:**
- New component `apps/<console>/src/app/layout/search-results.component.ts`
- Triggered when `SearchService.query()` is non-empty and the user is
  NOT on a list page that's already filtered (i.e., they're on
  /dashboard, /settings, etc.). Render an overlay panel beneath the
  top bar with results grouped by type.
- Each console queries its own services' search endpoints in parallel
  (admin-console hits 4–5 endpoints; developer-portal hits 3). Use
  `Promise.allSettled` so a slow service doesn't block the rest.
- Click a result → router.navigate to its detail page; close the panel.
- Keyboard: Esc closes, ↑/↓ moves selection, Enter activates.

**Acceptance:**
- Type "alice" → results panel renders within 500 ms locally with all
  matches across services
- Each existing per-page search input still works (they're separate
  concerns — the per-page filter is "filter what I already see",
  global search is "find it anywhere")
- Empty `search` param on any list endpoint returns the same data as
  before (backwards-compatible)

**Out of scope:** ranking / scoring (alphabetical sort within type is
fine); fuzzy matching (`ILIKE` already does the job for most cases);
search across docs (Scalar has its own).

---

## Phase 3 — Real-time session updates via WebSocket (2–3 days)

### Item 3.1 — Push-based session/me invalidation

**Current state:** both `SessionStore`s poll `/api/v1/session/me` every
30 s. Cost: ~12 requests/min/active-tab during dev (5 tabs = 60 req/min).
A role revocation takes up to 30 s to show in the UI (backend
enforcement is instant; UI is just stale chrome). The polling is fine
today; this is a "becomes worth doing when…" item.

**Triggers for actually doing this:**
- More than ~50 concurrent admin sessions (poll volume becomes
  visible in admin-api logs)
- A revocation-latency complaint from a real customer
- Mobile / low-bandwidth users where 12 req/min matters

**Until a trigger fires, skip this item.** When it lands, the plan:

**Architecture:**
- NestJS WebSocket gateway at `apps/admin-api/src/session/session.gateway.ts`
  and `apps/developer-portal-api/src/session/session.gateway.ts`
- Auth: WebSocket upgrade carries the `sso_session` cookie via the
  default Origin handshake; reuse `SessionCookieGuard` adapted as a
  `@UseGuards(SessionCookieGuard)` on the gateway
- Single message type: `{ event: 'invalidate' }` — fire when membership /
  role / platform_admin changes for the connected user. Client receives
  it, calls `session.reload()`, and the next render reflects new state.
- **Server-side fan-out:** publish to NATS subject `session.invalidate.<user_id>`
  whenever:
  - admin-api: PATCH `/memberships/:id/role`, DELETE `/memberships/:id`,
    POST `/platform/admins`, DELETE `/platform/admins/:id`
  - identity-service: PATCH `/auth/session/active-tenant`, password reset,
    MFA enroll/delete
- Gateway subscribes to NATS with the user's id and forwards.

**Client changes:**
- `SessionStore._startPolling()` keeps a 5-minute fallback poll (in
  case the WebSocket drops). Don't rip it out — push and poll
  compose: poll for liveness, push for freshness.
- New `_connectWebSocket()` method invoked from `onInit`. Reconnect
  with exponential backoff on close (max 60 s).
- On `invalidate` message: `void this.reload()`.

**Acceptance:**
- Revoke a user's `manage_members` capability from admin-console — the
  affected user's sidebar updates within 2 s (versus up to 30 s
  today)
- WebSocket disconnect (e.g., laptop closes) → re-opens cleanly on lid
  re-open; no auth loop
- 5-min fallback poll fires when WebSocket is unhealthy
- Closing the tab cleanly disconnects (no orphan connections in
  admin-api logs)

**Out of scope:** server-side presence ("who else is signed in"). That's
a UX product feature, not a session-freshness mechanism.

---

## Phase 4 — OpenFGA per-resource permissions (5–8 days)

### Item 4.1 — Resource-scoped ACLs via OpenFGA

**Current state:** capability-based RBAC answers "**can this user, in
general, manage OAuth apps?**" It does NOT answer "**can this user
manage *this specific* OAuth app?**" That distinction matters as soon
as we ship any of:
- Per-resource ownership ("Alice owns app X; Bob is an editor")
- Cross-tenant sharing (a SCIM token issued in tenant A used in B)
- Group-based grants ("members of engineering can manage any API key
  tagged eng:*")
- External delegation (a service-account scoped to specific resources)

**Trigger:** a real customer asks for any of the four. Until then,
capability gating is sufficient and this phase stays in the plan.

When it lands:

**Sub-phases:**

#### 4.1a — Resource types in the FGA model

`openfga/model.fga` already has `organization`, `application`,
`api_key`, `webhook`, `oauth_app`. Extend each with explicit
`owner`, `editor`, `viewer` relations and the required `define
can_*` rules:

```fga
type oauth_app
  relations
    define organization: [organization]
    define owner: [user]
    define editor: [user, group#member] or owner
    define viewer: [user, group#member] or editor
    define can_edit: editor
    define can_delete: owner
    define can_view: viewer
```

Repeat for `api_key`, `webhook`, `scim_token`.

#### 4.1b — Tuple writes on resource create / transfer

Every CREATE handler that mints a resource must write the corresponding
`owner` tuple. The pattern is already buffered: writes go to the
`authz_outbox` Postgres table, a worker drains them into OpenFGA.

- `apps/admin-api/src/identity-providers/idp.service.ts` createSaml /
  createOidc — write `oauth_app:<id>#owner@user:<actor_id>`
- `apps/developer-portal-api/src/oauth-apps/oauth-apps.service.ts`
  create — same
- `apps/developer-portal-api/src/api-keys/api-keys.service.ts`
  create — `api_key:<id>#owner@user:<actor_id>`
- Webhooks (when webhook-service exposes a create endpoint)
- Transfer endpoints (TBD product req) — delete old owner tuple,
  write new

The outbox worker is already running at
`apps/identity-service/internal/service/outbox_worker.go` —
new tuple types just need the matching SQL.

#### 4.1c — Wire `@RequirePermission` on mutation handlers

The decorator + guard exist at
`libs/nestjs-auth/src/lib/decorators/require-permission.decorator.ts`
and `libs/nestjs-auth/src/lib/rebac.guard.ts`. Set
`AUTHZ_SERVICE_URL` in both NestJS services' env (today: missing).
Pattern:

```ts
@Patch(':id')
@RequireCapability('manage_oauth_apps')           // cap layer (already there)
@RequirePermission('can_edit', 'oauth_app')       // OpenFGA layer (new)
@RequireVerifiedEmail()
async update(@Param('id') id: string, @Body() dto) { ... }
```

The decorators compose; all three guards run in order. A user with
the capability but no per-resource grant gets 403; a user with the
grant but no capability gets 403; a user with both passes.

Apply on:
- `oauth-apps`: update, rotate-secret, delete
- `api-keys`: delete (create is gated by capability only — the
  caller becomes owner)
- `webhooks`: update, delete
- `scim-tokens`: delete (admins only — capability layer alone may be
  enough)
- IdP (admin-api): update, delete

#### 4.1d — Tests

- E2E: alice creates app X → bob (admin in same tenant) gets 403 on
  PATCH unless granted editor; alice can grant bob editor; bob can
  then PATCH
- Stress: capability hit + OpenFGA miss returns 403, NOT 500

#### 4.1e — Docs

- Promote `docs/architecture/adr-0003-openfga.md` from Proposed to
  Accepted
- Add the "Per-resource permissions" section to
  `docs/architecture/rbac.md`

**Acceptance:** every action item in adr-0003-openfga.md is checked.

**Risks:**
- OpenFGA write latency on resource creation. Outbox decouples it
  (eventual consistency), so the create handler returns immediately
  but the resource is briefly unprotected. Acceptable — capability
  layer is the immediate gate.
- Tuple GC on resource delete. Add to the same outbox flow.
- Performance: every gated request adds one OpenFGA Check call
  (network + p99 latency hit). Authz-service has L1+L2+L3 cache
  already; should be fine, but instrument.

---

## Phasing recommendation

| Phase | Items | Effort | When |
|---|---|---|---|
| 1 | Bundle bump + cap split + search wiring | 1–2 days | Anytime; no dependencies |
| 2 | Server-side search aggregator | 2–3 days | When >20 of any resource is normal |
| 3 | WebSocket sessions | 2–3 days | On revocation-latency complaint or >50 concurrent admin sessions |
| 4 | OpenFGA wiring | 5–8 days | On real per-resource permission requirement |

Phases 2–4 can be skipped if the trigger conditions never materialize.
Phase 1 is "cleanup we deferred for time" and has no trigger — it's
just queued.

---

## Open questions

1. **Cap split scope** — should `manage_invitations` also get a
   `read_invitations`? Today it gates both. Probably not, but flag
   for review if "view-pending-invites-only" becomes a need.
2. **Search panel UX** — should it open below the top bar (overlay)
   or push the page content down? Pinion-style portals (Linear, Vercel)
   overlay; Pinion's own admin app pushes. Decide in design review.
3. **WebSocket auth across cookie refresh** — when the
   `sso_session` cookie rotates (it does on tenant switch), the
   existing WebSocket carries the old cookie. Decide: reconnect on
   tenant switch (simpler) or refresh the handshake mid-stream
   (more code, no user-visible benefit).
4. **OpenFGA store ID per environment** — `openfga/.store-id`
   today is a single file. CI test environments need their own
   store; sketch the bootstrap so a `BUF_STORE_ID` env var can
   override.
5. **Cap-vocab backward compatibility** — if any external customer
   integration reads the cap list from `/session/me`, splitting
   `manage_api_keys` is technically backwards-compatible (we keep
   it; we just also emit `read_api_keys`). Verify nothing reads
   *negative* sets ("if cap is NOT manage_api_keys → block").

---

## Critical files

| File | Phase | What changes |
|---|---|---|
| `apps/admin-console/project.json` | 1.1 | Bundle budget ↑ 650 KB |
| `libs/shared-types/src/lib/enums.ts` | 1.2 | +4 read caps |
| `libs/nestjs-auth/src/lib/capabilities.ts` | 1.2 | Matrix extension |
| `libs/nestjs-auth/src/lib/capabilities.spec.ts` | 1.2 | New rows |
| `apps/admin-api/src/{users,memberships,groups}/*.controller.ts` | 1.2 | Read caps on GETs |
| `apps/developer-portal-api/src/{api-keys,oauth-apps}/*.controller.ts` | 1.2 | Read caps on GETs |
| `apps/admin-console/src/app/features/{groups,audit}/*.component.ts` | 1.3 | SearchService consumers |
| Admin-api + audit-service + dev-portal-api list endpoints | 2.1 | `?search=` param |
| `apps/<console>/src/app/layout/search-results.component.ts` (new) | 2.1 | Aggregated panel |
| `apps/<service>/src/session/session.gateway.ts` (new ×2) | 3.1 | WebSocket fan-out |
| `apps/<console>/src/app/core/session/session.store.ts` | 3.1 | WebSocket client + fallback poll |
| `openfga/model.fga` | 4.1 | owner/editor/viewer per type |
| All resource-mutation handlers | 4.1 | `@RequirePermission(...)` |
| `docs/architecture/{rbac.md,adr-0003-openfga.md}` | 4.1 | Promote ADR |

---

## Verification matrix

After each phase, the green-light is:
- `pnpm nx affected -t build,test,lint` clean
- `pnpm docs:export && git diff --exit-code docs/api/` clean
- For Phase 1.1: `pnpm nx build admin-console` shows no budget warning
- For Phase 1.2: `vitest libs/nestjs-auth` reports 24+ tests passing
  (12 base + 8 verified-email + N new cap-split cases)
- For Phase 1.3: typing in the top-bar narrows Groups and Audit live
- For Phase 2.1: `curl '…/users?search=alice'` returns only alice;
  the search-results panel renders cross-service hits
- For Phase 3.1: revocation propagates within 2 s; WebSocket drop +
  reconnect within 60 s; tab close hits `gateway.handleDisconnect()`
- For Phase 4.1: alice-creates-app, bob-gets-403, alice-grants-bob,
  bob-passes; capability+OpenFGA composition table from rbac.md is
  exercised end-to-end
