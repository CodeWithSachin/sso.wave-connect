-- Migration 000023 DOWN
DROP INDEX IF EXISTS uq_tenant_domains_primary_per_tenant;
COMMENT ON COLUMN tenant_domains.check_attempts IS NULL;
