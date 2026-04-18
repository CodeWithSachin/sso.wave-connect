-- Migration 000026: Functional index on users(email-domain)
--
-- Phase 4 perf fix. The migration worker's `ListCandidatesForDomain` query
-- filters users by `split_part(u.email, '@', 2) = LOWER($1)` to find personal-
-- tenant users whose domain just got claimed. Without an index on that
-- expression Postgres runs a sequential scan on `users` — fine at 100 users,
-- untenable at 100k+.
--
-- Email is CITEXT so the stored value is already case-insensitive for equality;
-- we still `LOWER()` the arg in the query for defense-in-depth. The index
-- mirrors that expression exactly so the planner can use it.
--
-- Scoped WHERE deleted_at IS NULL because the worker never looks at deleted
-- users, and partial indexes keep hot-path updates cheap.

-- CONCURRENTLY deliberately omitted — golang-migrate wraps each migration in
-- a transaction and CREATE INDEX CONCURRENTLY cannot run inside one. For prod
-- rollouts on a large users table, run the CONCURRENTLY variant out-of-band
-- before applying this migration (the migration will then be a no-op via
-- IF NOT EXISTS) and document the step in the deploy runbook.
CREATE INDEX IF NOT EXISTS idx_users_email_domain
    ON users ((split_part(email, '@', 2)))
    WHERE deleted_at IS NULL;

COMMENT ON INDEX idx_users_email_domain IS
    'Used by tenant_domain_migrations worker to enumerate users whose email domain matches a newly-verified claim. Match the expression in ListCandidatesForDomain verbatim.';
