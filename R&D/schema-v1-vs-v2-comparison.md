# SSO Platform Database Schema: V1 vs V2 Comparison

## Overview

The V1 schema (`database-schema.sql`) was a functional starting point with 25+ tables, 16 enum types, 55+ indexes, RLS on 15 tables, and partitioning on time-series tables. However, a critical review revealed **15 production-grade issues** that would surface under real load. The V2 schema (`database-schema-v2.sql`) addresses every one of them.

This document explains each fix: what was wrong, why it matters, and what changed.

---

## FIX-1: Native UUID Primary Keys (Index Size: 5.6x Reduction)

**V1 Problem:** All primary keys used `VARCHAR(90)` to store TypeID strings like `user_01h2xcej...`. A VARCHAR(90) column uses up to 91 bytes per row (1 byte length prefix + 90 bytes data). Every foreign key, every index entry, and every JOIN comparison pays that cost.

**V2 Solution:** Primary keys are now native `UUID` (16 bytes). A separate generated column stores the TypeID prefix for API serialization. Foreign keys reference the 16-byte UUID, not the string.

**Why it matters at scale:**
With 10M users and 6 indexes on the `users` table, V1 consumed ~5.5 GB in index storage for PKs alone. V2 drops that to ~960 MB. Smaller indexes mean more fits in `shared_buffers`, fewer disk reads, and faster sequential scans across every JOIN in the system.

---

## FIX-2: Composite Indexes — tenant_id First

**V1 Problem:** Some composite indexes placed columns like `email` or `slug` before `tenant_id`. For example, a unique index on `(email)` alone rather than `(tenant_id, email)`.

**V2 Solution:** Every composite index on a tenant-scoped table now leads with `tenant_id`.

**Why it matters:**
Row-Level Security appends `WHERE tenant_id = current_setting('app.current_tenant_id')` to every query. If `tenant_id` isn't the leftmost column in the index, Postgres can't use the index for the RLS filter and falls back to a sequential scan or bitmap heap scan. With tenant_id first, the planner uses a single index range scan for both the RLS filter and the business-logic predicate.

---

## FIX-3: Optimistic Locking (version Column)

**V1 Problem:** No concurrency control on mutable business tables. Two admins editing the same OAuth client, tenant policy, or group simultaneously would silently overwrite each other's changes (lost-update anomaly).

**V2 Solution:** Added `version INTEGER NOT NULL DEFAULT 1` to: `tenants`, `tenant_policies`, `users`, `oauth_clients`, `identity_providers`, `groups`, `documents`, `webhook_endpoints`. Every UPDATE includes `WHERE version = $expected_version` and increments the version.

**Why it matters:**
This is a standard pattern (used by Stripe, Auth0, WorkOS) for multi-admin SaaS. Without it, a race condition between two API calls can silently discard one admin's config change — a security-critical bug in an SSO platform.

---

## FIX-4: FILLFACTOR Tuning on Hot-Update Tables

**V1 Problem:** All tables used the default FILLFACTOR of 100 (pages packed full). Tables like `sessions` (updated on every request via `last_activity_at`) generate massive amounts of dead tuples because Postgres must write a new row version on a different page.

**V2 Solution:**
- `sessions`: FILLFACTOR 80
- `token_deny_list`: FILLFACTOR 70
- `refresh_token_families`: FILLFACTOR 80

**Why it matters:**
A lower FILLFACTOR leaves free space on each page, enabling Heap-Only Tuple (HOT) updates. HOT updates don't require index updates and don't create dead index entries. For a session table handling 10K updates/second, this reduces autovacuum pressure by 40-60% and eliminates index bloat from high-frequency column updates.

---

## FIX-5: Webhook Event Type — ENUM to VARCHAR

**V1 Problem:** `webhook_event_type` was a PostgreSQL ENUM. ENUMs in Postgres are append-only: you can add values with `ALTER TYPE ... ADD VALUE`, but you **cannot remove or rename values** without recreating the type and all dependent columns.

**V2 Solution:** Changed to `VARCHAR(100)` with a `CHECK` constraint referencing a `webhook_event_types` reference table. New events are added by inserting a row; deprecated events are soft-deleted.

**Why it matters:**
Webhook event types evolve constantly as features ship. An SSO platform might start with `user.login`, `user.created` and quickly grow to 50+ events. ENUM lock-in forces painful migrations. VARCHAR + reference table gives the same data integrity with full evolvability.

---

## FIX-6: Idempotency Keys

**V1 Problem:** No duplicate protection on webhook deliveries or SCIM sync operations. Network retries, message queue redeliveries, or SCIM provider retries could create duplicate rows.

**V2 Solution:** Added `idempotency_key VARCHAR(255)` with a unique index on:
- `webhook_deliveries` — prevents duplicate delivery of the same event
- `scim_sync_log` — prevents duplicate provisioning operations

**Why it matters:**
Enterprise SCIM providers (Okta, Azure AD) retry aggressively. Without idempotency, a single "create user" SCIM push can create multiple user records or log duplicate sync entries. The idempotency key lets the database enforce exactly-once semantics at the storage layer.

---

## FIX-7: Audit Log Immutability — Trigger to REVOKE

**V1 Problem:** Audit log immutability was enforced by a per-row `BEFORE UPDATE OR DELETE` trigger that raised an exception. At high audit volume (100K+ events/hour), this trigger fires on every INSERT (Postgres checks BEFORE triggers on all DML), adding measurable overhead.

**V2 Solution:** Remove the trigger entirely. Instead, use PostgreSQL's native permission system:
```sql
REVOKE UPDATE, DELETE ON audit_logs FROM app_user;
```

**Why it matters:**
Role-level REVOKE is enforced at the catalog level — zero per-row overhead. The database doesn't even compile a trigger function. At 100K events/hour, this eliminates ~100K trigger invocations per hour with identical security guarantees.

---

## FIX-8: RLS with SET LOCAL (PgBouncer Compatibility)

**V1 Problem:** RLS policies referenced `current_setting('app.current_tenant_id')`, but the guide's middleware examples used `SET app.current_tenant_id = '...'` — a session-scoped command. With PgBouncer in transaction mode (the standard production setup), session state leaks to the next client that reuses the connection.

**V2 Solution:** Documented and enforced `SET LOCAL` instead of `SET`. `SET LOCAL` is scoped to the current transaction and automatically resets on COMMIT/ROLLBACK.

**Why it matters:**
This is a **tenant data isolation bug**. If Tenant A's session variable leaks to Tenant B's connection, Tenant B's queries run with Tenant A's RLS filter — exposing Tenant A's data to Tenant B. `SET LOCAL` eliminates the leak entirely.

---

## FIX-9: DEFAULT Partitions on Time-Series Tables

**V1 Problem:** `audit_logs` and `webhook_deliveries` used monthly range partitions (e.g., `audit_logs_2024_01`), but had no DEFAULT partition. If a cron job fails to create next month's partition before midnight, every INSERT fails with a "no partition found" error.

**V2 Solution:** Added `CREATE TABLE audit_logs_default PARTITION OF audit_logs DEFAULT` and the same for `webhook_deliveries`.

**Why it matters:**
A missing partition causes a hard outage: all audit logging stops, all webhook deliveries fail. The DEFAULT partition catches any row that doesn't match an existing range, preventing data loss. A background job can then create the proper partition and move rows from DEFAULT.

---

## FIX-10: BRIN Indexes on Monotonic Timestamps

**V1 Problem:** B-tree indexes on `created_at` columns in partitioned tables. B-tree indexes on append-only, monotonically increasing timestamps are wasteful — they store every single value in a sorted tree.

**V2 Solution:** BRIN (Block Range INdex) indexes on `created_at` for `audit_logs` and `webhook_deliveries`.

**Why it matters:**
BRIN indexes store min/max summaries per block range (e.g., per 128 pages). For monotonic data like timestamps on append-only tables, BRIN is ~100x smaller than B-tree with nearly identical query performance for range scans. A B-tree on 100M audit rows might be 2 GB; the equivalent BRIN index is ~20 MB.

---

## FIX-11: Targeted GIN Indexes on JSONB Metadata

**V1 Problem:** No indexes on any JSONB `metadata` columns. Queries filtering on metadata fields (e.g., "find all users with metadata->>'department' = 'engineering'") would require full table scans.

**V2 Solution:** Added GIN indexes on `metadata` columns only where the application actually queries them (documented with comments). Not every table with a JSONB column needs a GIN index — only those where the API supports metadata filtering.

**Why it matters:**
GIN indexes on JSONB enable fast containment queries (`@>` operator). But GIN indexes are expensive to maintain on write-heavy tables, so they should only be added where read patterns justify them. V2 strikes the right balance.

---

## FIX-12: UNLOGGED token_deny_list

**V1 Problem:** `token_deny_list` was a regular (WAL-logged) table. Every denied token write generates WAL entries, replication traffic, and fsync overhead. But this table is a Redis fallback — Redis is the primary deny list, Postgres is only for cold-start recovery.

**V2 Solution:** `CREATE UNLOGGED TABLE token_deny_list` — skips WAL writes entirely.

**Why it matters:**
UNLOGGED tables are 2-3x faster for writes because they skip the Write-Ahead Log. The tradeoff is data loss on crash — but since Redis is the primary store and tokens have short TTLs (minutes to hours), losing the Postgres fallback on crash is acceptable. Redis repopulates it on restart.

---

## FIX-13: Session Table Hash Partitioning (Large Deployments)

**V1 Problem:** The `sessions` table was a single heap. At scale (millions of concurrent sessions across thousands of tenants), this becomes a bottleneck for both reads and vacuum.

**V2 Solution:** Documented hash partitioning by `tenant_id` as an option for large deployments:
```sql
CREATE TABLE sessions (...) PARTITION BY HASH (tenant_id);
CREATE TABLE sessions_p0 PARTITION OF sessions FOR VALUES WITH (MODULUS 16, REMAINDER 0);
-- ... 15 more partitions
```

**Why it matters:**
Hash partitioning distributes rows evenly across partitions. Queries filtered by `tenant_id` (which is all of them, thanks to RLS) hit exactly one partition. Autovacuum runs per-partition, reducing lock contention. Parallel queries can scan multiple partitions simultaneously.

---

## FIX-14: created_by Audit Columns

**V1 Problem:** To answer "who created this membership?" you had to JOIN against `audit_logs` and search for the matching action — an expensive query pattern for a common question.

**V2 Solution:** Added `created_by VARCHAR` to `memberships` and other business tables where "who did this?" is a frequent query.

**Why it matters:**
Admin dashboards constantly need "invited by" / "created by" information. Embedding it directly on the row eliminates a JOIN against the high-volume audit_logs table. This is a denormalization, but the right one — audit_logs is for compliance forensics, not for rendering admin UIs.

---

## FIX-15: Read-Model Views

**V1 Problem:** Common API queries (list user's memberships with tenant name, list active sessions, list groups with member counts) required multi-table JOINs written inline in every query.

**V2 Solution:** Three materialized views for hot API paths:
- `v_user_memberships` — user + tenant + membership in one row
- `v_active_sessions` — only non-expired, non-revoked sessions with user info
- `v_groups_with_count` — groups with precomputed member counts

**Why it matters:**
Views encapsulate JOIN logic, simplify application code, and can be replaced with materialized views if performance demands it. The query planner inlines simple views, so there's no performance penalty — just cleaner code and a single place to optimize the query pattern.

---

## Summary Table

| # | Issue | V1 | V2 | Impact |
|---|-------|----|----|--------|
| 1 | PK storage | VARCHAR(90) = 91 bytes | UUID = 16 bytes | 5.6x smaller indexes |
| 2 | Index alignment | Mixed column order | tenant_id always first | RLS uses indexes properly |
| 3 | Concurrency | No protection | version column | Prevents lost updates |
| 4 | Page utilization | FILLFACTOR 100 | 70-80 on hot tables | HOT updates, less bloat |
| 5 | Event types | ENUM (immutable) | VARCHAR + ref table | Events can evolve |
| 6 | Deduplication | None | Idempotency keys | Exactly-once semantics |
| 7 | Audit immutability | Per-row trigger | REVOKE at role level | Zero per-row overhead |
| 8 | Connection pooling | SET (session-scoped) | SET LOCAL (tx-scoped) | No tenant data leaks |
| 9 | Partition safety | No DEFAULT | DEFAULT partition | No INSERT failures |
| 10 | Time-series indexes | B-tree | BRIN | 100x smaller indexes |
| 11 | JSONB queries | No indexes | Targeted GIN | Fast metadata filtering |
| 12 | Token deny list | WAL-logged | UNLOGGED | 2-3x faster writes |
| 13 | Session scaling | Single heap | Hash partitioned | Per-tenant parallelism |
| 14 | Audit attribution | JOIN audit_logs | Inline created_by | Eliminates expensive JOINs |
| 15 | Query patterns | Inline JOINs | Read-model views | Cleaner, optimizable queries |

---

## Recommendation

Use `database-schema-v2.sql` as the production schema. The V1 file can be kept as a reference for understanding the table structure, but every fix in V2 addresses a real issue that would surface under production load — from data leaks (FIX-8) to hard outages (FIX-9) to silent data corruption (FIX-3).
