# ADR-0003: OpenFGA wiring for fine-grained resource ACLs

**Status:** Accepted
**Date:** 2026-05-17 (promoted from Proposed stub; landed with Phase 4 of the deferred roadmap)
**Supersedes:** —
**Superseded by:** —

## Why this stub exists

[ADR-0002](../../.claude/plans/agent-skills-you-temporal-prism.md#adr-0002-unified-rbac-across-both-consoles)
deliberately deferred OpenFGA wiring. Capability-based RBAC (the layer
ADR-0002 ships) answers "**can this user, in general, manage X?**" It does
**not** answer "**can this user manage *this specific* X?**"

OpenFGA — the relational permission engine already running at
[`apps/authz-service`](../../apps/authz-service) with a model at
[`openfga/model.fga`](../../openfga/model.fga) — is what closes that gap.
The proto + service + handler are shipped; no NestJS code calls them yet.

## When to write the full ADR

Pick this up when one of these requirements lands:

1. **Per-resource ownership.** "User A owns OAuth app X; User B is an editor
   on X; User C is a viewer." Right now `manage_oauth_apps` is all-or-nothing.
2. **Cross-tenant sharing.** A SCIM token issued by tenant A is referenced
   by tenant B; the capability layer can't express this.
3. **Group-based grants.** "Members of group `engineering` can manage all
   API keys tagged `eng:*`." The cap layer says yes/no per user; OpenFGA
   reasons over groups.
4. **External delegation.** A service-account user from outside the tenant
   model needs scoped access to specific resources.

If none of those is on the roadmap, capability gating is sufficient.

## Sketch of the integration

Composes with — does not replace — capability gating:

```ts
@Post(':id/edit')
@RequireCapability('manage_oauth_apps')           // ← cap layer (already there)
@RequirePermission('can_edit', 'oauth_app')       // ← OpenFGA layer (new)
async update(@Param('id') id: string, @Body() dto) {
  return this.svc.update(id, dto);
}
```

- `RequireCapability` fires first; rejects users who can't manage OAuth
  apps at all.
- `RequirePermission` fires second; rejects users who *can* manage OAuth
  apps in general but lack `can_edit` on the *specific* `oauth_app:<id>`.

The decorator + guard already exist:
[`libs/nestjs-auth/src/lib/decorators/require-permission.decorator.ts`](../../libs/nestjs-auth/src/lib/decorators/require-permission.decorator.ts)
and [`libs/nestjs-auth/src/lib/rebac.guard.ts`](../../libs/nestjs-auth/src/lib/rebac.guard.ts). What's missing is:

1. Setting `AUTHZ_SERVICE_URL` in both NestJS services' env config.
2. Writing tuples to OpenFGA whenever resources are created/transferred
   (currently the `authz_outbox` table is the buffer; the worker that
   drains it lives in identity-service per Phase 4).
3. Modelling the new resource types in `openfga/model.fga`.
4. Wiring `@RequirePermission` decorators on the resource-mutation
   endpoints.

## Action items — landed in Phase 4 (2026-05-17)

1. [x] Identify resource types — `oauth_app`, `api_key`, `webhook`, `idp`
       (scim_token deferred: capability layer alone is sufficient there).
2. [x] Extend `openfga/model.fga` — four new types with `owner / editor /
       viewer` relations and `can_view / can_edit / can_delete` rules.
       `org_admin` shortcut lets organisation admins inherit edit access
       without explicit per-resource grants.
3. [x] Wire `AUTHZ_SERVICE_URL` — `RebacGuard` reads `process.env` lazily;
       env-var documented in `docs/architecture/rbac.md`. RebacGuard is
       fail-closed if unset on a `@RequirePermission`-decorated route.
4. [x] Tuple writes — oauth-apps + api-keys create handlers write
       `<type>:<id>#owner@user:<actor>` into `authz_outbox` in the same
       transaction as the resource insert. The existing outbox worker in
       authz-service drains it into OpenFGA.
5. [x] `@RequirePermission` decorators on oauth-apps (update,
       rotate-secret, delete) and api-keys (delete). Capability layer
       still gates the operation in general; OpenFGA layer gates the
       *specific* resource.
6. [x] Composition: capability hit + OpenFGA miss returns 403
       ("Authorization service unavailable" on env miss, "Permission
       denied" on relation miss). Verified at unit-test level; E2E
       coverage tracked as a follow-up against a running dev env.
7. [x] "Per-resource permissions" section added to
       `docs/architecture/rbac.md`.

## Follow-up

- webhooks + IdP resource types: model + decorators in place but tuple
  writes on create not yet wired. Same mechanical pattern as
  oauth-apps; defer until those features grow real per-instance
  ownership requirements.
- scim_token: intentionally absent from the model. Re-evaluate if
  external service-account delegation arrives.
- E2E test fixture: a "alice creates app, bob (admin in same tenant)
  gets 403 on PATCH, alice grants bob editor, bob now passes" scenario
  needs a running dev stack with seeded users + an OpenFGA store. Filed
  as a separate task.

## What stays the same

- The `Capability` vocabulary doesn't shrink. Per-instance permissions
  *add* on top.
- `/session/me` continues to return capabilities, not OpenFGA relations.
  Per-instance checks happen on the specific mutation endpoints; they're
  too granular for the session bootstrap payload.
- The frontend continues to filter nav by capabilities. It doesn't ask
  OpenFGA whether each row in a list is editable — UI shows the edit
  affordance optimistically and the server returns 403 if denied. (If
  this ever becomes a UX problem, add a `/check` batch endpoint that
  returns per-row permissions for a page of resources.)
