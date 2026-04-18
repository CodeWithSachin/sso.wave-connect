-- Migration 000023: Enforce at-most-one-primary domain per tenant
--
-- Phase 2 review fix #2. Migration 000022 documented the "exactly one verified
-- tenant_domains row per tenant has is_primary=TRUE" invariant as
-- application-enforced, but `MarkVerified`'s correlated-subquery approach has
-- a race: two concurrent verifications for the same tenant both evaluate
-- NOT EXISTS at statement start, both see "no primary", both flip to TRUE.
--
-- A partial unique index makes the DB reject the second write atomically.
-- Callers catching 23505 can then retry or downgrade to non-primary (current
-- behavior in the Go repo: translate to ErrDomainAlreadyVerified-style error
-- and leave the row verified-but-not-primary).

CREATE UNIQUE INDEX uq_tenant_domains_primary_per_tenant
    ON tenant_domains (tenant_id)
    WHERE is_primary = TRUE AND status = 'verified' AND deleted_at IS NULL;

-- Re-comment `check_attempts` so its semantics are unambiguous for future
-- operators reading the schema. "Attempts" was misleading; this is a count
-- of every DNS poll, regardless of outcome (pending/verified/expired).
COMMENT ON COLUMN tenant_domains.check_attempts IS
    'Total DNS lookup attempts made (successful or not) — increments on every cron tick and every on-demand verify call.';
