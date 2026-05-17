# RBAC — Role-Based Access Control

> Authoritative reference for capability-based auth across wave-connect.
> See [ADR-0002](../../.claude/plans/agent-skills-you-temporal-prism.md#adr-0002-unified-rbac-across-both-consoles)
> for the design rationale.

## TL;DR

- A **capability** is a single string from a closed union (e.g. `manage_members`).
- The set of capabilities a user holds is **derived server-side** from
  (membership role, tenant kind, platform-admin role) by one function:
  [`computeCapabilities()`](../../libs/nestjs-auth/src/lib/capabilities.ts).
- Both NestJS services (`admin-api`, `developer-portal-api`) expose
  `GET /api/v1/session/me`, which returns the capability list among other
  session metadata.
- Both Angular consoles call their own `/session/me`, store the result in a
  `SessionStore` (poll every 30 s), and gate the **UI** (sidebar items +
  route guards) on `capabilities.includes(...)`.
- Both NestJS services gate the **backend** with the `@RequireCapability(...)`
  decorator from `libs/nestjs-auth`; the corresponding `RequireCapabilityGuard`
  is wired as `APP_GUARD` and lazily derives the caller's caps on the first
  decorated route they hit per request.

## The vocabulary

The full `Capability` union lives in
[`libs/shared-types/src/lib/enums.ts`](../../libs/shared-types/src/lib/enums.ts).
Three tiers:

| Tier | Capability | Granted to |
|------|------------|------------|
| **Platform** | `view_platform_admins` | superadmin, support |
| | `manage_platform_admins` | superadmin |
| | `view_tenant_settings` | superadmin, support, **+** tenant owner/admin (any kind) |
| | `view_audit_log` | superadmin, support, readonly **+** organisation owner/admin |
| **Tenant admin** | `read_members` | every active organisation membership |
| | `manage_members` | organisation owner/admin |
| | `manage_domains` | organisation owner/admin |
| | `manage_identity_providers` | organisation owner/admin |
| | `manage_invitations` | organisation owner/admin |
| | `view_migrations` | organisation owner/admin |
| | `force_migration` | organisation **owner** only |
| **Developer** | `view_developer_resources` | every active membership |
| | `read_api_keys` | every active membership |
| | `manage_api_keys` | owner, admin, member |
| | `read_oauth_apps` | every active membership |
| | `manage_oauth_apps` | owner, admin, member |
| | `read_webhooks` | every active membership |
| | `manage_webhooks` | owner, admin, member |
| | `manage_scim_tokens` | owner, admin only |

The `read_*` capabilities (Item 1.2 split) are **additive** — every holder
of `manage_X` also holds `read_X`. Reads gate GET routes; writes stay on
`manage_*`. This lets `billing_manager` and `readonly` audit usage without
inheriting writeful capabilities.

The matrix is the **only** place that maps role → caps. Don't re-derive
elsewhere; consume the array directly.

## Backend enforcement

```ts
import { RequireCapability, TenantId } from '@sso-platform/nestjs-auth';

@Controller('api/v1/api-keys')
export class ApiKeysController {
  @Post()
  @RequireCapability('manage_api_keys')   // ← gate the write
  create(@TenantId() tenantId: string, @Body() dto: CreateDto) {
    return this.svc.create(tenantId, dto);
  }

  @Get()
  @RequireCapability('view_developer_resources')  // ← gate the read
  list(@TenantId() tenantId: string) {
    return this.svc.list(tenantId);
  }
}
```

Rules:
- **Multiple caps on the same decorator = union (any-of).** A handler
  decorated `@RequireCapability('manage_members', 'manage_invitations')`
  passes if the caller holds either.
- **No decorator = no capability requirement.** The route is still gated
  by `SessionCookieGuard` (auth required) but role is irrelevant.
- **Apply on a class** to set a default for every handler; per-handler
  decorators override.
- Capability mismatch returns **HTTP 403** with body
  `{ error: 'insufficient_capability', required: [...] }`. The full
  capability list is **never** echoed to the caller (cross-origin leak
  surface).

The guard is wired in both `AppModule`s:

```ts
providers: [
  { provide: APP_GUARD, useClass: SessionCookieGuard },
  { provide: APP_GUARD, useClass: RequireCapabilityGuard },
]
```

Caps are lazily derived on the first decorated route per request and cached
on `request.user.capabilities` for the rest of the chain.

## Frontend enforcement

Each console has its own `SessionStore` ([admin-console](../../apps/admin-console/src/app/core/session/session.store.ts), [developer-portal](../../apps/developer-portal/src/app/core/session/session.store.ts)) with identical shape:

```ts
SessionStore.capabilities() // → Capability[]
SessionStore.hasCapability()(cap) // → boolean (computed factory)
```

Route guards use `requireCapability(...)`:

```ts
// app.routes.ts
{
  path: 'scim',
  canActivate: [requireCapability(['manage_scim_tokens'])],
  loadComponent: () => import('./features/scim/...'),
}
```

Sidebar nav filters use the same vocabulary:

```ts
readonly allNavItems = [
  { path: 'scim', label: 'SCIM Tokens', caps: ['manage_scim_tokens'] },
  ...
];
readonly navItems = computed(() => {
  const have = this.session.capabilities();
  return this.allNavItems.filter((i) =>
    i.caps.length === 0 || i.caps.some((c) => have.includes(c))
  );
});
```

`caps: []` means "show to any signed-in user."

## How to add a capability

1. Edit [`libs/shared-types/src/lib/enums.ts`](../../libs/shared-types/src/lib/enums.ts) — add the string to the `Capability` union.
2. Edit [`libs/nestjs-auth/src/lib/capabilities.ts`](../../libs/nestjs-auth/src/lib/capabilities.ts) — extend the `computeCapabilities()` matrix to emit the new cap for the right (role, kind, platform-role) combinations.
3. Decorate the relevant controller handlers with `@RequireCapability('new_cap')`.
4. Add the cap to the appropriate route guard(s) in the consoles' `app.routes.ts`.
5. Add the cap to the appropriate sidebar entry in `layout.component.ts`.
6. Run `pnpm docs:export && git diff docs/api/` — the OpenAPI spec should show the new gate in the operation's `security` / forbidden response.

The unit tests at
[`libs/nestjs-auth/src/lib/capabilities.spec.ts`](../../libs/nestjs-auth/src/lib/capabilities.spec.ts)
should be extended to cover the new cap.

## Session refresh

Both consoles poll `/session/me` every 30 s ([POLL_MS](../../apps/admin-console/src/app/core/session/session.store.ts)). A role
change made via admin-console takes effect:
- **Server-side:** immediately, on the next request the affected user makes.
- **Client-side:** up to 30 s later, when the next poll lands.

A tenant switch is a deliberate full-page reload, so the SessionStore
re-hydrates from scratch.

## What's intentionally NOT here (yet)

- **OpenFGA / ReBAC for per-resource permissions** (e.g. "can edit *this*
  OAuth app"). Capability gating handles "can manage OAuth apps in
  general." Per-resource owner/editor relations land in [ADR-0003](./adr-0003-openfga.md)
  when cross-tenant sharing or per-resource ACLs are needed.
- **Push-based session invalidation.** 30 s polling is the bound. WebSocket
  push is a follow-up if revocation latency becomes a real complaint.
- **Capability scopes for OAuth access tokens.** Current API key
  `scopes: ['admin:read', ...]` and the `Capability` union are independent
  vocabularies; bringing them under one roof is its own ADR.

## Verification recipes

**Capability mismatch returns 403:**

```sh
# As a tenant `readonly` user (no manage_scim_tokens cap):
curl -X POST -b "sso_session=<readonly-user-cookie>" \
     http://localhost:3500/api/v1/scim-tokens \
     -H "Content-Type: application/json" -d '{"label":"hack"}'
# Expected: 403 { "error": "insufficient_capability", "required": ["manage_scim_tokens"] }
```

**Capability hit returns 201:**

```sh
# Same endpoint, owner/admin cookie:
curl -X POST -b "sso_session=<admin-user-cookie>" \
     http://localhost:3500/api/v1/scim-tokens \
     -H "Content-Type: application/json" -d '{"label":"prod-okta"}'
# Expected: 201 with { token: "...", prefix: "..." }
```

**UI filter agrees with backend:**

Sign in as each role; the nav should match exactly what the role can act on:

| Role | admin-console nav | developer-portal nav |
|------|---|---|
| `owner` | All tenant-admin items + (if platform-admin) platform items | All items including SCIM Tokens |
| `admin` | Same as owner except no `force_migration` paths | Same as owner |
| `member` | Dashboard, Members, Groups, My sessions | Dashboard, API Keys, OAuth Apps, Webhooks, Activity, Docs, Account |
| `billing_manager` | Dashboard, Members, Groups, My sessions | Dashboard, API Keys, OAuth Apps, Webhooks, Activity, Docs, Account |
| `readonly` | Dashboard, Members, Groups, Audit (if granted), My sessions | Dashboard, API Keys, OAuth Apps, Webhooks, Activity, Docs, Account |

Members + Groups appear for all org memberships post Item 1.2; the gate
is `read_members` (additive to `manage_members`). The developer-portal
list pages render for all memberships via `read_*` caps; mutation
controls stay hidden for `billing_manager` and `readonly`.
