# ADR-0003 (stub): OpenFGA wiring for fine-grained resource ACLs

**Status:** Proposed (placeholder)
**Date:** TBD
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

## Action items (when this ADR fires)

1. [ ] Identify the resource types that need per-instance permissions
       (likely starting with OAuth apps + API keys).
2. [ ] Extend `openfga/model.fga` with `owner | editor | viewer` relations
       per type.
3. [ ] Wire `AUTHZ_SERVICE_URL` in admin-api + developer-portal-api env
       configs; the existing `RebacGuard` reads it from `process.env`.
4. [ ] Add tuple-write hooks to resource create/transfer endpoints so the
       OpenFGA store mirrors the database state.
5. [ ] Decorate the relevant handlers with `@RequirePermission(...)`.
6. [ ] Stress test: capability hit + OpenFGA miss should return 403, not 500.
7. [ ] Document the composition rule above in `docs/architecture/rbac.md`
       under a new "Per-resource permissions" section.
8. [ ] Promote this stub to a full ADR with Status: Accepted.

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
