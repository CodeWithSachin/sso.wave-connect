# ReBAC / OpenFGA Integration Audit — V2 Schema

## Verdict: The V2 schema structurally aligns with the OpenFGA model, but has 5 operational gaps that will cause production issues.

The tables, columns, and relationships map correctly to every OpenFGA type and relation. The problem isn't the entity model — it's the **sync layer** between Postgres (source of truth for entities) and OpenFGA (source of truth for permissions).

---

## Part 1: What Works (Entity-to-Type Mapping)

Each OpenFGA type maps cleanly to a Postgres table, and every relation has a source column or table that triggers tuple creation.

### organization (→ tenants table)

| OpenFGA Relation | Postgres Source | Tuple Created When |
|---|---|---|
| `owner` | `memberships` WHERE role = 'owner' | User assigned owner role |
| `admin` | `memberships` WHERE role = 'admin' | User assigned admin role |
| `member` | `memberships` WHERE role = 'member' | User joins tenant |
| `billing_manager` | `memberships` WHERE role = 'billing_manager' | Role assignment |

`tenants.openfga_store_id` correctly isolates each tenant's permission graph in a separate OpenFGA store.

### group (→ groups + group_memberships + group_nesting tables)

| OpenFGA Relation | Postgres Source | Tuple Created When |
|---|---|---|
| `owner` (organization) | `groups.tenant_id` | Group created |
| `admin` | `group_memberships` WHERE role = 'admin' | User made group admin |
| `member` (user) | `group_memberships` WHERE role = 'member' | User added to group |
| `member` (group#member) | `group_nesting.child_group_id → parent_group_id` | Group nested under another |

The `group_nesting` table correctly supports OpenFGA's `group#member` syntax for transitive group membership.

### application (→ oauth_clients table)

| OpenFGA Relation | Postgres Source | Tuple Created When |
|---|---|---|
| `owner` (organization) | `oauth_clients.tenant_id` | App created |
| `admin`, `editor`, `viewer` | **OpenFGA only** (no Postgres table) | Assigned via API |

This is correct — per-app RBAC lives entirely in OpenFGA as relationship tuples, not in Postgres columns.

### folder (→ folders table)

| OpenFGA Relation | Postgres Source | Tuple Created When |
|---|---|---|
| `owner` | `folders.owner_user_id` | Folder created |
| `parent` | `folders.parent_id` | Folder nested |
| `editor`, `viewer` | **OpenFGA only** | Shared via API |
| `can_write` / `can_read` | **Computed** by OpenFGA via `can_write from parent` | Automatic inheritance |

The `parent_id` self-reference correctly feeds OpenFGA's `parent` relation, enabling the `can_write_parent: can_write from parent` permission inheritance chain.

### document (→ documents table)

| OpenFGA Relation | Postgres Source | Tuple Created When |
|---|---|---|
| `owner` | `documents.owner_user_id` | Document created |
| `parent_folder` | `documents.folder_id` | Document placed in folder |
| `editor`, `viewer`, `commenter` | **OpenFGA only** | Shared via API |
| `folder_write` / `folder_read` | **Computed** by OpenFGA via `can_write from parent_folder` | Automatic inheritance |

### api_resource (→ api_resources table)

| OpenFGA Relation | Postgres Source |
|---|---|
| `owner` (application) | `api_resources.application_id` |
| `owner_org` (organization) | `api_resources.tenant_id` |

### feature_flag (→ feature_flags table)

| OpenFGA Relation | Postgres Source |
|---|---|
| `owner` (organization) | `feature_flags.tenant_id` |
| `enabled_for` | `feature_flags.allowed_user_ids` / `allowed_group_ids` arrays + rollout percentage |

---

## Part 2: The 5 Gaps That Will Break You in Production

### GAP-1: No Transactional Outbox for Tuple Writes (Critical)

**The problem:** The guide shows this pattern:
```go
// Step 1: Postgres commit
h.membershipRepo.Create(ctx, user.ID, tenant.ID, "member")
// Step 2: OpenFGA write (separate network call)
h.authzClient.WriteTuples(ctx, storeID, tuples)
```

If Step 1 succeeds but Step 2 fails (network timeout, OpenFGA down, pod restart), Postgres says the user is a member but OpenFGA says they have no permissions. The user exists but can't access anything. **There is no retry mechanism.**

**The fix — add an `authz_outbox` table:**
```sql
CREATE TABLE authz_outbox (
    id              BIGSERIAL       PRIMARY KEY,
    tenant_id       UUID            NOT NULL REFERENCES tenants(id),
    store_id        VARCHAR(100)    NOT NULL,
    operation       VARCHAR(10)     NOT NULL CHECK (operation IN ('write', 'delete')),
    tuple_user      VARCHAR(500)    NOT NULL,
    tuple_relation  VARCHAR(100)    NOT NULL,
    tuple_object    VARCHAR(500)    NOT NULL,
    status          VARCHAR(20)     NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    retry_count     SMALLINT        NOT NULL DEFAULT 0,
    max_retries     SMALLINT        NOT NULL DEFAULT 5,
    last_error      TEXT,
    idempotency_key VARCHAR(255)    NOT NULL,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    processed_at    TIMESTAMPTZ,
    CONSTRAINT uq_authz_outbox_idempotency UNIQUE (idempotency_key)
);

CREATE INDEX idx_authz_outbox_pending
    ON authz_outbox (status, created_at)
    WHERE status IN ('pending', 'failed');
```

**Usage pattern:**
```go
// Both in ONE Postgres transaction
tx.Exec("INSERT INTO memberships ...")
tx.Exec("INSERT INTO authz_outbox (operation, tuple_user, tuple_relation, tuple_object, ...) VALUES ('write', 'user:...', 'member', 'organization:...', ...)")
tx.Commit()

// Background worker polls authz_outbox, writes to OpenFGA, marks completed
```

This is the **Transactional Outbox Pattern** — the same pattern used by Kafka Connect, Debezium, and every reliable event-driven system. It guarantees eventual consistency between Postgres and OpenFGA.

---

### GAP-2: No `openfga_model_id` on Tenants (Medium)

**The problem:** `tenants` has `openfga_store_id` but no column to track which authorization model version each tenant is running. The guide describes model migration with gradual rollout and validation tests — but without tracking the model ID per tenant, you can't:
- Roll out a new model to 10% of tenants
- Roll back a broken model for one tenant
- Audit which tenants are on which model version

**The fix:**
```sql
ALTER TABLE tenants ADD COLUMN openfga_model_id VARCHAR(100);
-- The authorization model ID returned by OpenFGA WriteAuthorizationModel
```

---

### GAP-3: No Permission Snapshot Table for OpenFGA Downtime (Medium)

**The problem:** If OpenFGA is down, all `Check()` calls fail. The guide mentions Redis caching (L1/L2), but Redis TTLs are short (30s positive, 10s negative). An OpenFGA outage lasting more than 30 seconds means every permission check fails.

**The fix — add a materialized permission cache in Postgres:**
```sql
CREATE UNLOGGED TABLE permission_cache (
    user_id         UUID            NOT NULL,
    relation        VARCHAR(100)    NOT NULL,
    object_type     VARCHAR(50)     NOT NULL,
    object_id       UUID            NOT NULL,
    allowed         BOOLEAN         NOT NULL,
    cached_at       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ     NOT NULL,
    PRIMARY KEY (user_id, relation, object_type, object_id)
);
```

This acts as L3 cache — stale but non-empty. Better to serve 5-minute-old permissions than to deny everything.

---

### GAP-4: Missing Tuple Audit Trail (Low-Medium)

**The problem:** `audit_logs` tracks Postgres CRUD operations, but tuple writes to OpenFGA are fire-and-forget. When a security incident occurs and you need to answer "who granted Alice editor access to folder X, and when?", the answer lives only in OpenFGA's ReadChanges API — which has limited retention and no cross-tenant search.

**The fix — the `authz_outbox` table from GAP-1 doubles as an audit trail** if you never delete completed rows (just partition by month and archive):
```sql
-- Add to authz_outbox:
    actor_user_id   UUID,            -- Who initiated this tuple change
    source          VARCHAR(50),     -- 'api', 'scim', 'saml_sync', 'admin_ui'
```

---

### GAP-5: `membership_role` ENUM Doesn't Fully Match OpenFGA Organization Relations (Low)

**The problem:** The Postgres `membership_role` enum has: `owner, admin, member, billing_manager, readonly`. The OpenFGA model defines relations: `owner, admin, member, billing_manager`. There's a mismatch:
- `readonly` exists in Postgres but NOT in the OpenFGA model
- OpenFGA derives `can_view: member` — meaning every member can view. There's no "readonly" computed permission.

**The fix:** Either:
1. Add `readonly` to the OpenFGA model with appropriate computed permissions, OR
2. Remove `readonly` from the Postgres enum and use OpenFGA's fine-grained viewer relations on specific resources instead (recommended — `readonly` as a blanket role fights against ReBAC's granularity)

---

## Part 3: Summary — Schema Changes Needed

| Gap | Table | Change | Priority |
|-----|-------|--------|----------|
| GAP-1 | **NEW: `authz_outbox`** | Transactional outbox for reliable tuple sync | Critical |
| GAP-2 | `tenants` | Add `openfga_model_id VARCHAR(100)` | Medium |
| GAP-3 | **NEW: `permission_cache`** | UNLOGGED L3 permission cache | Medium |
| GAP-4 | `authz_outbox` | Add `actor_user_id`, `source` columns | Low-Medium |
| GAP-5 | `membership_role` enum | Remove `readonly` or add to OpenFGA model | Low |

---

## Part 4: What the V2 Schema Gets Right for ReBAC

Despite the gaps above, the foundational design is solid:

1. **Per-tenant OpenFGA stores** (`tenants.openfga_store_id`) — complete permission isolation between tenants.

2. **UUID PKs** — OpenFGA tuples reference entities by `type:uuid` format. Native UUIDs mean no string parsing overhead when constructing tuple keys.

3. **`owner_user_id` columns on folders and documents** — directly map to OpenFGA `owner` relations. When a folder is created, the Postgres INSERT and the OpenFGA WriteTuple can use the same user UUID.

4. **`group_nesting` table** — models the `group#member` transitive relation in OpenFGA. When group A is nested under group B, the tuple `group:A#member → member → group:B` gives all members of A implicit membership in B.

5. **`folders.parent_id` self-reference** — mirrors OpenFGA's `parent: [folder]` relation exactly. When you set `parent_id` in Postgres, you write a corresponding `folder:child → parent → folder:parent` tuple. OpenFGA then computes `can_read` transitively up the tree.

6. **No permission columns in Postgres** — editor/viewer/commenter relations live exclusively in OpenFGA. This is the correct ReBAC pattern. Postgres holds entities and structural relationships; OpenFGA holds permission relationships.

7. **`identity_providers.auto_sync_groups`** — when true, SAML/OIDC login triggers group tuple writes to OpenFGA, keeping IdP groups and ReBAC permissions in sync.

The V2 schema is a **good ReBAC foundation**. Add the outbox table and model tracking, and it's production-ready.
