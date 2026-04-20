# Plan: Admin Role Surfaces & Missing Admin-Console Pages

**Status:** draft, review-ready
**Authors:** platform team
**Target repo:** `sso.wave-connect`
**Target apps:** `admin-console` (primary), `login-portal` (minor), `developer-portal` (token sharing)
**Scope:** ship the missing tenant-admin + platform-admin UI surfaces, role-aware navigation, and the cross-cutting scaffolding they depend on.

---

## 1. Problem statement

The platform has **four user tiers** (super admin, org admin, org user, individual user) fully implemented at the data + API layer, but the admin-console UI covers only a subset of what the tiers can do.

### Current state

| Tier | Schema | Backend API | Frontend UI |
|---|---|---|---|
| Super admin | ✅ `platform_admins` + bootstrap migration | ✅ `POST/GET/DELETE /api/v1/platform/admins` | ❌ no route |
| Org admin | ✅ `memberships.role ∈ {owner, admin}` | ✅ full admin-api | 🟡 missing: domains, sso, invitations, migrations |
| Org user | ✅ `memberships.role ∈ {member, billing_manager, readonly}` | ✅ ReBAC-gated reads | ✅ covered (but no role-based gating) |
| Individual user | ✅ `tenant_kind='personal'`, `max_users=1` | ✅ `POST /auth/public/signup` | ✅ covered |

### What's missing (the work)

1. **Platform admins surface** — grant/revoke/list super admins + support admins.
2. **Domains** — add domain, fetch TXT record, verify, delete; DNS propagation UX.
3. **Single Sign-On (identity providers)** — SAML + OIDC configuration for the active tenant.
4. **Invitations** — pending/accepted/expired list; resend, revoke, copy link.
5. **Migrations** — post-claim ownership transfer admin controls.
6. **Rename `/users` → `/members`** (data model calls them members; UI drifted).
7. **Role-based UI gating** — hide what the caller can't do; deny-by-default on typed URLs.
8. **Shared role/session state** — today every component that needs "am I an admin?" would refetch memberships; need a single source of truth.
9. **Design system unification** — Wave Connect tokens live in three duplicated `styles.css` files; lift them into `libs/ui-components`.

### Non-goals for this plan

- Billing UI (product excluded).
- Developer-portal feature parity (API keys, OAuth apps, SCIM tokens pages already exist).
- Backend business logic changes beyond minor endpoints we call out explicitly.
- Mobile-specific layouts (the design targets desktop-first; mobile is "works but not designed for").

---

## 2. Architecture decisions (the 7 that matter)

Each decision is stated, options compared, choice made, rationale pinned.

### D1. Where do role and identity state live on the client?

**Options**
- (a) Each guard / component fetches what it needs on demand.
- (b) Single `SessionStore` (ngrx/signals) loaded once at app bootstrap; all consumers subscribe.
- (c) Encode platform-admin tier + active membership role into the id_token claims.

**Choice: (b) SessionStore, hydrated at bootstrap.** One HTTP round-trip to a new `GET /auth/session/me` endpoint. All guards, the sidebar, and every feature page read the same signals. Tenant switch + grant/revoke flows call `sessionStore.reload()`.

**Why not (c):** claim enrichment requires sso-service changes + a token-refresh dance on every permission change. Too slow for "demote admin, page updates immediately."

**Why not (a):** chatty, introduces race conditions (sidebar re-renders before the guard resolves), and every future page adds boilerplate.

**Artifact:** `apps/admin-console/src/app/core/session/session.store.ts` (signalStore).

### D2. Route layout + guard composition

**Options**
- (a) Keep current flat layout (`/dashboard`, `/users`, ...) and sprinkle guards.
- (b) Split into two persona roots: `/` for tenant admin, `/platform` for super admin, with separate shells.
- (c) One shell with a "context switcher" pill (Tenant · Platform) in the top bar.

**Choice: (b) + (c) combined.** Two route roots, distinct shells (so the super-admin context doesn't show a tenant chip); a pill in the topbar lets super admins flip between the two contexts. Non-super-admins never see the switch, so the single-persona UX stays clean.

**Guard composition** — two composable guards:
- `authGuard` (existing): ensures `sso_session` cookie.
- `requireCapabilityGuard(caps: Capability[])`: reads `sessionStore.capabilities()` and allows if *any* capability matches. Capabilities are derived from role, not from the route's name.

**Why capability-over-role:** `can_manage_domains` might be true for `owner`, `admin`, and a hypothetical future `domain_admin` role. Checking "do you have the capability" insulates the UI from role-enum churn.

### D3. Feature page architecture (same shape across all 5 pages)

```
features/<feature>/
├── <feature>.component.ts       # Smart, zero service calls inline
├── <feature>.store.ts           # signalStore with resource() for lists
├── <feature>.service.ts         # HttpClient wrapper, types from shared-types
├── <feature>.service.spec.ts    # Vitest + HttpTestingController
├── forms/                       # Signal Forms for create/edit dialogs
├── components/                  # Presentational bits specific to the feature
└── README.md                    # 10-line "what this feature does + flow diagram"
```

**Why:** predictable shape → reviewers find things in seconds; every page is refactorable to a lazy-loaded remote without structural surgery.

### D4. Shared primitives

`libs/ui-components/src/lib/` already has `avatar`, `badge`, `button`, `card`, `dialog`, `input`, `loading`, `pagination`, `table`, `toast`. We'll add three:

- `wc-page-header/` — title + subtitle + actions row; every feature page uses it.
- `wc-empty-state/` — Lucide icon + one-line hint + optional primary CTA.
- `wc-confirm-dialog/` — destructive action confirmation (delete domain, revoke platform admin).

And one non-component module:

- `libs/ui-components/src/lib/styles/wc-tokens.css` — the Wave Connect token block currently duplicated across the three `styles.css` files. Each app's `styles.css` becomes `@import 'wc-tokens.css';` + app-specific overrides.

### D5. Data fetching pattern

**Choice: `resource()` + signals everywhere.**

- Lists → `resource({ params: () => ({ page, q }), loader: async ({ params }) => service.list(params) })`
- Single-item fetches → `httpResource()`
- Mutations → `async` method on the store that calls the service, then `resource.reload()`

**Why not rxjs `Observable` streams for the new code:** [CLAUDE.md](../../CLAUDE.md) explicitly says "Prefer `httpResource` / `toSignal` / `computed` for new async-reactive code." Existing `Observable` code in other parts of the app isn't touched by this plan.

### D6. Forms

**Choice: Signal Forms** (Angular 21.2 ships them; the repo is already on 21.2).

- Create domain, create IdP (SAML + OIDC variants), invite member, grant platform admin.
- Validation as `computed()` of the form signals.
- Submit disabled until `form.valid() && !form.submitting()`.

**Why not Reactive Forms:** they work but they're `Observable`-first; mixing them into our signals-first store would introduce adapters.

### D7. Backend contract changes

Minimal. **Two** additions, **one** clarification:

1. **New: `GET /auth/session/me`** (identity-service). Returns:
   ```ts
   {
     user: { id, email, emailVerified, firstName, lastName, avatarUrl };
     activeTenant: { id, name, slug, displayName, tenantKind, plan };
     memberships: Array<{ tenantId, tenantName, tenantKind, role, status }>;
     platformAdmin: null | { role: 'superadmin' | 'support' | 'readonly' };
     capabilities: Capability[];  // derived; see §5 "Capability matrix"
   }
   ```
   One endpoint = the sessionStore's hydration source.

2. **New: `GET /api/v1/memberships?status=invited|accepted|expired`** (admin-api). The controller exists; the filter doesn't. Tiny patch to `memberships.service.ts`.

3. **Clarify:** `POST /api/v1/memberships/:id/resend` endpoint — confirm it exists, or add it. Required for the Invitations page.

No schema migrations. No breaking changes to existing endpoints.

---

## 3. Capability matrix

Source of truth: generated from role + tenant_kind at request time in `/auth/session/me`. UI consumes it; backend enforces it independently (defense in depth).

| Capability | superadmin | support | org owner | org admin | org member | billing_mgr | readonly | individual |
|---|---|---|---|---|---|---|---|---|
| `platform.manageAdmins` | ✅ | — | — | — | — | — | — | — |
| `platform.listTenants` | ✅ | ✅ | — | — | — | — | — | — |
| `platform.forceMigration` | ✅ | ✅ | — | — | — | — | — | — |
| `tenant.manageMembers` | — | — | ✅ | ✅ | — | — | — | — |
| `tenant.manageDomains` | — | — | ✅ | ✅ | — | — | — | — |
| `tenant.manageSSO` | — | — | ✅ | ✅ | — | — | — | — |
| `tenant.manageInvitations` | — | — | ✅ | ✅ | — | — | — | — |
| `tenant.managePolicies` | — | — | ✅ | ✅ | — | — | — | — |
| `tenant.manageBilling` | — | — | ✅ | — | — | ✅ | — | — |
| `tenant.viewAudit` | — | — | ✅ | ✅ | — | — | — | — |
| `tenant.viewDashboard` | — | — | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| `personal.editSelf` | — | — | — | — | — | — | — | ✅ |

A user may hold **platform** capabilities AND **tenant** capabilities at the same time (a super admin can also be an Acme Inc member) — the two sets union. The UI shell uses the union; each route's guard checks its own capability slice.

---

## 4. Phased delivery

Each phase is a single PR (or tight stack) shippable on its own. Phase N+1 never blocks Phase N from being reverted.

### Phase 0 — Foundation (no user-visible change)

**Goal:** move tokens out, add primitives, add SessionStore skeleton, add the `/auth/session/me` endpoint.

**Changes**
- `libs/ui-components/src/lib/styles/wc-tokens.css` — lift the token block from `apps/*/src/styles.css`.
- Each app's `styles.css` → `@import '@sso-platform/ui-components/styles/wc-tokens.css';`.
- `libs/ui-components/src/lib/page-header/`, `empty-state/`, `confirm-dialog/` — new presentational components.
- `libs/shared-types/src/lib/session.ts` — `SessionMeDto`, `Capability` union, `PlatformRole` enum.
- `apps/identity-service/internal/handler/session.go` — `GET /auth/session/me` handler; SQL joins existing tables, computes capabilities, returns DTO.
- `apps/admin-console/src/app/core/session/session.store.ts` — signalStore: `user()`, `activeTenant()`, `memberships()`, `platformAdmin()`, `capabilities()`; `reload()`, `setActiveTenant(id)`.
- `apps/admin-console/src/app/app.config.ts` — `APP_INITIALIZER` calls `sessionStore.reload()` so the guard has data by the time it runs.

**Acceptance**
- `pnpm nx build admin-console developer-portal login-portal` passes.
- No UI change.
- `curl localhost:3000/auth/session/me --cookie "sso_session=…"` returns the DTO.
- `libs/ui-components/src/lib/page-header/*.spec.ts` passes.

**Rollback:** revert the PR. No data migration, no flag.

**LoC estimate:** ~500 net additions.

### Phase 1 — Role-aware guards + sidebar gating

**Goal:** hide sidebar items the caller can't use; block URL-typed access.

**Changes**
- `apps/admin-console/src/app/core/guards/require-capability.guard.ts` — reads `sessionStore.capabilities()`, redirects to `/403` if absent.
- `apps/admin-console/src/app/core/guards/no-access.component.ts` — simple "you don't have permission" page.
- `apps/admin-console/src/app/layout/layout.component.ts` — `navItems` becomes a `computed()` signal that filters by capability.
- `apps/admin-console/src/app/app.routes.ts` — every feature route gains `canActivate: [authGuard, requireCapabilityGuard(['tenant.<cap>'])]`.

**Acceptance**
- Non-admin `member` signs in → sees only `dashboard`, `audit` (read), no destructive entries.
- Typing `/policies` as a `member` redirects to `/403`.
- Playwright role-matrix test (new): sign in as each of { owner, admin, member, individual }, snapshot visible sidebar entries.

**Feature flag:** `wc_role_gating` via env `VITE_FLAG_ROLE_GATING=1`. Off = everyone sees everything (today's behavior). On = filtered.

**LoC estimate:** ~200 additions.

### Phase 2 — Rename `/users` → `/members` + Invitations page

**Goal:** terminology alignment + highest-value new page.

**Changes**
- Rename folder `features/users/` → `features/members/`. Route `/users` → `/members` with a `redirectTo` preserving deep links.
- New `features/invitations/` following §D3 shape.
- Backend: add `?status=invited|accepted|expired` filter on `GET /api/v1/memberships` + verify `POST /api/v1/memberships/:id/resend`.
- New `POST /api/v1/memberships/:id/revoke` if missing (soft-deletes the invite).

**UI requirements**
- Columns: invitee email, role, invited by, invited on, expires, status badge.
- Row actions: `Resend` (if status=invited + not expired), `Copy link`, `Revoke`.
- Empty state with `Invite member` CTA linking to the Members page dialog.
- Filter tabs: All · Pending · Accepted · Expired.

**Acceptance**
- Invite a member from `/members/invite`, see it immediately in `/invitations` (Pending).
- Accept flow still lands correctly on `/invitation/:token` in login-portal.
- Revoke invalidates the token server-side; hitting the link returns 410.

**Feature flag:** `wc_invitations_page`.

**LoC estimate:** ~800 additions + rename churn.

### Phase 3 — Domains page

**Goal:** DNS TXT claim flow without leaving the console.

**Changes**
- New `features/domains/` folder with list + add-dialog + verify flow.
- Service wraps `/tenants/:tenantId/domains/*` endpoints on identity-service.
- TXT record display uses `wc-kbd` / copy-to-clipboard pattern.
- Verify button calls `POST .../verify`, shows the 10-min cron hint on failure, renders success toast.
- Domain row status: `Pending · Verifying · Verified · Failed`.
- Delete protected by `wc-confirm-dialog` ("deletes the TXT requirement; users on that domain will lose tenant-scoped email discovery").

**Acceptance**
- Add `acme.test`, copy TXT, paste into a local DNS stub, click Verify → status flips to Verified, toast `Domain verified`.
- Verify with no TXT → Failed state + guidance.
- Rate-limit hit → friendly message (backend already throttles).

**Feature flag:** `wc_domains_page`.

**LoC estimate:** ~700 additions.

### Phase 4 — SSO (identity providers) page

**Goal:** wire OIDC and SAML IdPs from the console.

**Changes**
- New `features/sso/` folder: list view + two forms (SAML, OIDC).
- SAML form fields: name, metadata URL, attribute mapping (email, firstName, lastName).
- OIDC form fields: name, issuer, clientId, clientSecret, scopes (tags input).
- Test connection button: pings `/api/v1/identity-providers/:id/test` (new endpoint; see backend addition below).
- Delete dialog warns about users who'll lose SSO and the backup password-login fallback.

**Backend addition**
- `POST /api/v1/identity-providers/:id/test` — server-side smoke test: metadata fetch for SAML, discovery doc fetch for OIDC. Returns `{ok: true}` or `{ok: false, error}`.

**Acceptance**
- Add an Okta OIDC IdP, run test, see green.
- Flip tenant to SSO-required; next login routes to IdP (verified by looking at `/auth/public/discover`).

**Feature flag:** `wc_sso_page`.

**LoC estimate:** ~900 additions.

### Phase 5 — Migrations page

**Goal:** surface the Phase 4 migration flow for tenant admins (the backend endpoints already exist).

**Changes**
- New `features/migrations/` folder: list view filtered by status.
- Row actions: `Send reminder` (→ `POST /tenants/:tenantId/migrations/:id/notify-force`), `Force move` (→ `POST .../force`; wrapped in a hard confirm).
- Timeline drawer per migration showing every event.

**Acceptance**
- Admin sees a pending migration, clicks Send reminder → email queued (verify via mail sink + audit log entry).
- Force move moves the membership row as the backend already does.

**Feature flag:** `wc_migrations_page`.

**LoC estimate:** ~600 additions.

### Phase 6 — Platform admins (super admin surface)

**Goal:** the only cross-tenant UI.

**Changes**
- New `apps/admin-console/src/app/platform/` — separate route root, separate layout component (no tenant chip, distinct header color band, "Platform" title).
- Routes: `/platform/admins`, `/platform/tenants` (list), `/platform/migrations` (cross-tenant view).
- Context switcher pill in the main layout topbar — visible only to platform admins. Switches the router to `/platform/*`.
- `PlatformAdminsList` uses the existing `/api/v1/platform/admins` endpoints.
- Create form: email lookup → shows matching user card → role picker (`superadmin`/`support`/`readonly`) → confirm.
- Revoke confirm has extra copy for revoking your own grant: disabled with "use another super admin" hint.

**Acceptance**
- Bootstrap super admin grants a second super admin, revokes the first one via the second (self-revoke blocked per backend guard).
- Non-platform-admin user typing `/platform/admins` → redirected to `/403`.

**Feature flag:** `wc_platform_admin_surface`.

**LoC estimate:** ~900 additions.

### Phase 7 — Hardening

- Playwright E2E matrix: for each of {super, org-owner, org-admin, org-member, individual}, run a scripted tour of the app. Any unexpectedly visible CTA → fail.
- Observability: every mutation on a new page emits an audit-service event with `actor_id`, `tenant_id`, `action`, `target_id`, `old_value`, `new_value`. Audit log query in `/audit` updated to include them.
- Docs: `OPERATIONS.md` updated to reference the new pages by route. Each feature's `README.md` finalised.
- Lighthouse-equivalent sanity check: bundle-size budget for admin-console → 600 KB initial (current 541 KB + tolerances). If exceeded, defer a feature page behind `loadComponent` (already default).

---

## 5. TypeScript contracts (stable surface)

Shared in `libs/shared-types/src/lib/` so FE + Nest backends agree.

```ts
// session.ts
export type PlatformRole = 'superadmin' | 'support' | 'readonly';
export type MembershipRole = 'owner' | 'admin' | 'member' | 'billing_manager' | 'readonly';
export type TenantKind = 'personal' | 'organization';

export type Capability =
  | 'platform.manageAdmins' | 'platform.listTenants' | 'platform.forceMigration'
  | 'tenant.manageMembers' | 'tenant.manageDomains' | 'tenant.manageSSO'
  | 'tenant.manageInvitations' | 'tenant.managePolicies' | 'tenant.manageBilling'
  | 'tenant.viewAudit' | 'tenant.viewDashboard'
  | 'personal.editSelf';

export interface SessionMeDto {
  user: {
    id: string;
    email: string;
    emailVerified: boolean;
    firstName?: string;
    lastName?: string;
    avatarUrl?: string;
  };
  activeTenant: {
    id: string;
    name: string;
    slug: string;
    displayName?: string;
    tenantKind: TenantKind;
    plan: string;
  };
  memberships: Array<{
    tenantId: string;
    tenantName: string;
    tenantKind: TenantKind;
    role: MembershipRole;
    status: 'active' | 'suspended' | 'invited' | 'expired';
  }>;
  platformAdmin: null | { role: PlatformRole };
  capabilities: Capability[];
}
```

The **SessionStore** exposes the DTO as signals plus derived helpers:

```ts
readonly hasCapability = (c: Capability) => this.capabilities().includes(c);
readonly isPlatformAdmin = computed(() => !!this.platformAdmin());
readonly isOrgAdmin = computed(() =>
  ['owner', 'admin'].includes(this.activeMembership()?.role ?? '')
);
```

---

## 6. Guards, routes, shell

```ts
// requireCapabilityGuard.ts
export const requireCapabilityGuard =
  (...caps: Capability[]): CanActivateFn =>
  () => {
    const session = inject(SessionStore);
    const router = inject(Router);
    if (caps.some((c) => session.hasCapability(c))) return true;
    router.navigate(['/403']);
    return false;
  };
```

```ts
// app.routes.ts (excerpt)
{
  path: '',
  canActivate: [authGuard],
  loadComponent: () => import('./layout/layout.component').then(m => m.LayoutComponent),
  children: [
    { path: 'dashboard', loadComponent: ..., canActivate: [requireCapabilityGuard('tenant.viewDashboard')] },
    { path: 'members',   loadComponent: ..., canActivate: [requireCapabilityGuard('tenant.manageMembers')] },
    { path: 'invitations',  loadComponent: ..., canActivate: [requireCapabilityGuard('tenant.manageInvitations')] },
    { path: 'domains',   loadComponent: ..., canActivate: [requireCapabilityGuard('tenant.manageDomains')] },
    { path: 'sso',       loadComponent: ..., canActivate: [requireCapabilityGuard('tenant.manageSSO')] },
    { path: 'migrations',   loadComponent: ..., canActivate: [requireCapabilityGuard('tenant.manageMembers')] },
    { path: 'policies',  loadComponent: ..., canActivate: [requireCapabilityGuard('tenant.managePolicies')] },
    { path: 'audit',     loadComponent: ..., canActivate: [requireCapabilityGuard('tenant.viewAudit')] },
    { path: 'users', redirectTo: 'members', pathMatch: 'prefix' }, // legacy alias
  ],
},
{
  path: 'platform',
  canActivate: [authGuard, requireCapabilityGuard('platform.manageAdmins', 'platform.listTenants')],
  loadComponent: () => import('./platform/platform-shell.component').then(m => m.PlatformShellComponent),
  children: [
    { path: 'admins',     loadComponent: ..., canActivate: [requireCapabilityGuard('platform.manageAdmins')] },
    { path: 'tenants',    loadComponent: ..., canActivate: [requireCapabilityGuard('platform.listTenants')] },
    { path: 'migrations', loadComponent: ..., canActivate: [requireCapabilityGuard('platform.forceMigration')] },
  ],
},
{ path: '403', loadComponent: () => import('./core/guards/no-access.component').then(m => m.NoAccessComponent) },
```

Sidebar entry filtering:

```ts
// layout.component.ts (relevant computed)
readonly navItems = computed<NavItem[]>(() =>
  ALL_NAV.filter(item => this.session.hasCapability(item.capability))
);
```

---

## 7. Testing strategy

| Layer | Tool | What it covers |
|---|---|---|
| Unit | Vitest | Service HTTP wrappers, signalStore transitions, capability derivation. |
| Component | Angular harness + Vitest | Smart components: "when `capabilities()` includes X, button renders". |
| Integration | `RouterTestingHarness` | Guard → redirect flow for every feature route. |
| E2E | Playwright | Role matrix tour (5 personas × 8 pages). Domain verify happy path. SSO OIDC add flow. |
| Contract | Nest `@nestjs/testing` + `supertest` | `/auth/session/me` shape vs `SessionMeDto`. |
| Visual | Playwright screenshot on CI (opt-in) | Detect regressions on the Wave Connect design rendering. |

**Minimum test coverage bar** on new code: 70% lines, 85% branches for guards and capability logic.

---

## 8. Feature flags + rollout

Each phase lands behind an env flag read by `apps/admin-console/src/app/environments/environment.ts`. Default = off in dev, on in staging after smoke, on in prod after 48h in staging with no incidents.

```ts
// environment.ts (append)
flags: {
  roleGating: import.meta.env.VITE_FLAG_ROLE_GATING === '1',
  invitationsPage: import.meta.env.VITE_FLAG_INVITATIONS === '1',
  domainsPage: import.meta.env.VITE_FLAG_DOMAINS === '1',
  ssoPage: import.meta.env.VITE_FLAG_SSO === '1',
  migrationsPage: import.meta.env.VITE_FLAG_MIGRATIONS === '1',
  platformAdminSurface: import.meta.env.VITE_FLAG_PLATFORM_ADMIN === '1',
},
```

`navItems` + route guards consult these flags to suppress entries while features are dark-shipped.

**Rollout sequence:**
1. Phase 0 merges to main, no flag (it's inert scaffolding).
2. Phase 1 flag on in dev → canary in staging → on in prod.
3. Phases 2–6 each go through the same gate; can ship in parallel after Phase 1.
4. Phase 7 (hardening) is rolling — every new page gets E2E coverage before its flag flips.

---

## 9. Observability + audit

Every mutation on the new pages must:
- Call the existing `POST` / `PATCH` / `DELETE` endpoint (no new audit plumbing; backend already writes to `audit-service`).
- Surface the audit event to the user through a toast: `Domain verified.` / `Platform admin granted to taylor@acme.test.`
- Be filterable in `/audit` by new action types (e.g. `platform_admin.granted`, `domain.verified`). Action-type enum lives in [`audit-service`](../../apps/audit-service).

Metrics (Prometheus, already wired via `/metrics`):
- `wc_admin_page_view_total{page="…"}` — counter per page mount.
- `wc_admin_mutation_total{action="…",result="success|error"}` — every mutation.
- `wc_session_me_latency_ms` histogram — hydration perf.

SLOs for the new surface:
- p95 page load under 800 ms over cellular.
- Zero 5xx on `/auth/session/me` per week (it's the bootstrap dependency; if it breaks, nothing loads).

---

## 10. Risks + mitigations

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| `/auth/session/me` becomes a bottleneck | High — app won't boot if this 500s | Low | Cache the response for 30s in the sessionStore; fall back to `/auth/session/memberships` (existing endpoint) on error + show a "limited mode" banner. |
| Capability drift between backend enforcement and frontend gating | Medium — user sees a button, click 403s | Medium | Generate the `Capability` union from a single source (`libs/shared-types`). Backend middleware uses the same file. Contract tests verify each role→capability mapping matches the table in §3. |
| Role demotion doesn't propagate until re-login | Medium — user retains admin UI | Low | Short-lived `/auth/session/me` cache (30s); force reload on tenant switch; add a websocket/SSE push from identity-service on role change (post-MVP). |
| Rename `/users` → `/members` breaks deep links | Low | Medium | `redirectTo: 'members'` on `/users`; preserve for one release cycle. Audit external docs + email templates. |
| Design tokens lift breaks existing visual parity | Medium | Low | Phase 0 runs visual regression in Playwright on the landing pages of all three apps before merge. |
| Growing admin-console bundle | Medium | High (new pages) | Every feature is lazy-loaded via `loadComponent`. Bundle size budget enforced in `nx build` with `--configuration=production`. |
| Super admin + org admin dual-role confusion | Medium | Medium | Context switcher pill explicitly names the mode ("Viewing as Platform Admin · Switch to Acme Inc"). Audit events tag the active context. |

---

## 11. Open questions for review

1. **IdP test endpoint shape.** `POST /api/v1/identity-providers/:id/test` — should it live on admin-api or be a sidecar on identity-service (which already talks to IdPs for real logins)? Leaning toward identity-service so the test path exactly matches runtime.

2. **Who gets to invite a super admin?** Current backend: only existing super admins. Should `support` be able to *list* pending super-admin grants (audit role)? The plan assumes "no — create/revoke stays superadmin-only, list is open to any platform admin." Confirm.

3. **Personal tenant owners and "individual user" route.** Should `/settings/personal` exist in admin-console for individual users, or is that strictly a login-portal concern (in the tenant switcher)? Current plan: **login-portal only** — admin-console isn't meant for single-user flows. Confirm.

4. **Tenant switch UX.** Today the switch happens in login-portal's `/select-tenant`. Should admin-console also have an inline tenant picker in the sidebar chip? If yes, it needs its own route + flow. Plan currently assumes the sidebar chip navigates to `/select-tenant`. Confirm.

5. **Role-demotion SSE vs poll.** Real-time demotion propagation is a nice-to-have but costs a websocket channel. Plan's MVP is poll-every-30s; promote to SSE if users complain. Confirm MVP is acceptable.

6. **Capability source of truth.** Plan derives capabilities on the server. Alternative: compute on the client from role + tenant_kind. Server-derived is the plan because it insulates the client from role-enum changes. Confirm.

---

## 12. Acceptance checklist (ship bar)

- [ ] `pnpm nx run-many --target=build --all` passes.
- [ ] `pnpm nx run-many --target=test --all` passes.
- [ ] `pnpm nx run-many --target=lint --all` passes.
- [ ] Playwright role-matrix spec green for all 5 personas.
- [ ] `/auth/session/me` documented in OpenAPI + consumed by a contract test.
- [ ] Each new feature has a `README.md` and an entry in [OPERATIONS.md](../../OPERATIONS.md).
- [ ] Bundle size budget respected (initial < 600 KB per app, production config).
- [ ] Each flag toggles cleanly: disabled = invisible; enabled = functional.
- [ ] Audit log shows events from each new mutation endpoint.
- [ ] No PrimeNG component added without a `primeng-passthrough` extension matching the Wave Connect design.
- [ ] Screen reader tour: sign in → open each new page → complete a create flow using only keyboard + screen reader (voiceover on macOS).

---

## 13. Timeline (rough, for sequencing only — not a commitment)

| Phase | Estimate | Parallelizable? |
|---|---|---|
| 0 — Foundation | 3 dev-days | No (blocks everything) |
| 1 — Role gating | 2 dev-days | No (blocks 2–6) |
| 2 — Members rename + Invitations | 4 dev-days | Yes (after 1) |
| 3 — Domains | 3 dev-days | Yes (after 1) |
| 4 — SSO | 4 dev-days | Yes (after 1) |
| 5 — Migrations | 2 dev-days | Yes (after 1) |
| 6 — Platform admins | 4 dev-days | Yes (after 1) |
| 7 — Hardening | 3 dev-days | Overlapping with 2–6 |

**Total critical path:** 3 + 2 + max(4,3,4,2,4) + 3 = **~16 dev-days** if two engineers work in parallel on phases 2–6. Single engineer sequential ≈ 25 dev-days.

---

## 14. What a reviewer should look for

1. **Is the capability matrix complete?** Missing capability = future 403 in the field.
2. **Is the SessionStore cache TTL sane?** 30s tradeoff — too long = stale demotions; too short = thrash.
3. **Does the `/platform/*` split create operational confusion?** Alternative is one shell with hard-gated menu entries; we chose two shells to avoid "wrong context" bugs.
4. **Are any of the 6 feature pages actually 2 pages?** Invitations + Members flirts with overlap — plan keeps them separate because invitation filters and member filters are distinct (status, role vs. name, MFA, joined-at).
5. **Is the test matrix 5×8 the right cardinality?** 5 personas × 8 pages = 40 assertions. Smaller = undercover; larger = flaky. Comfortable.
6. **Does the feature flag scheme have a kill switch?** Yes — each flag gates both the route and the sidebar entry; disabling returns the app to today's behavior.

---

## 15. Out of scope explicitly

- Moving to module federation / micro-frontends. Plan assumes Bucket C (independent SPAs linked by SSO) unchanged.
- Replacing PrimeNG. Passthrough overrides are sufficient for Wave Connect design.
- Real-time role propagation (SSE/WS) — deferred, see Q5.
- Multi-factor enrollment reminders UI — orthogonal to this plan.
- Billing surfaces — explicit product non-goal.
- Personal-tenant deletion UX — edge case; handled via support today.

---

## Appendix A — File tree after this plan lands

```
apps/admin-console/src/app/
├── app.config.ts                       # +APP_INITIALIZER for session hydration
├── app.routes.ts                       # +platform root, +feature routes
├── core/
│   ├── guards/
│   │   ├── auth.guard.ts               # unchanged
│   │   ├── require-capability.guard.ts # new
│   │   └── no-access.component.ts      # new
│   └── session/
│       ├── session.store.ts            # new
│       └── session.service.ts          # new (HTTP wrapper for /auth/session/me)
├── features/
│   ├── dashboard/                      # unchanged
│   ├── members/                        # renamed from users/
│   ├── invitations/                    # new
│   ├── groups/                         # unchanged
│   ├── domains/                        # new
│   ├── sso/                            # new
│   ├── migrations/                     # new
│   ├── policies/                       # unchanged
│   ├── audit/                          # unchanged
│   ├── webhooks/                       # unchanged
│   └── scim/                           # unchanged
├── platform/                           # new route root
│   ├── platform-shell.component.ts
│   ├── admins/
│   ├── tenants/
│   └── migrations/
└── layout/
    └── layout.component.ts             # +computed navItems, +context switcher

libs/ui-components/src/lib/
├── styles/
│   └── wc-tokens.css                   # new — the canonical token block
├── page-header/                        # new
├── empty-state/                        # new
└── confirm-dialog/                     # new

libs/shared-types/src/lib/
├── session.ts                          # new — SessionMeDto, Capability, PlatformRole
└── index.ts                            # +export

apps/identity-service/internal/handler/
└── session.go                          # +GET /auth/session/me

apps/admin-api/src/memberships/
├── memberships.controller.ts           # +?status filter
├── memberships.service.ts              # +filter logic, +resend endpoint
└── dto/membership-response.dto.ts      # +status field

apps/admin-api/src/identity-providers/
└── idp.controller.ts                   # +POST :id/test

docs/plans/
└── admin-role-surfaces.md              # this file
```

## Appendix B — How to evaluate this plan against alternatives

When another AI reviews this, the axes that separate "good" from "over-engineered" or "under-engineered":

1. **Surface area:** 5 new pages + 1 rename + 1 cross-cutting state store. Reasonable. A bigger plan would add platform tenant CRUD + support-impersonation; a smaller plan would skip migrations + platform admins entirely.
2. **Consistency:** every feature page has the same folder shape, same primitives, same test matrix. Reviewers should push back if any phase deviates.
3. **Reversibility:** each phase is flaggable + PR-sized. Any phase can be reverted independently.
4. **Contract clarity:** one new endpoint (`/auth/session/me`) and one shared types module carry the weight. No hidden coupling.
5. **Enforcement split:** frontend hides what it can't do; backend enforces independently. Single source of capability truth (the types module + the server handler).

If the reviewer proposes simplifications, consider: (a) collapsing Invitations into Members (kept separate for status-filter clarity), (b) deferring Migrations (kept because the backend is already live and the feature has user value), (c) inlining platform admin into the main shell (rejected because super-admin ≠ tenant-admin context).

If the reviewer proposes additions, consider: (a) SSE for real-time role propagation, (b) per-group ReBAC tuple explorer, (c) an "impersonate user" support flow. All good ideas, none on this plan's critical path.
