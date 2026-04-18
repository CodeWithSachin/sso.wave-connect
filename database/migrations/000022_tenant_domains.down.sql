-- Migration 000022 DOWN: Drop tenant_domains table + supporting enums.

DROP TRIGGER IF EXISTS trg_tenant_domains_updated_at ON tenant_domains;
DROP INDEX IF EXISTS idx_tenant_domains_domain_lookup;
DROP INDEX IF EXISTS idx_tenant_domains_tenant;
DROP INDEX IF EXISTS idx_tenant_domains_pending;
DROP INDEX IF EXISTS uq_tenant_domains_verified_domain;
DROP TABLE IF EXISTS tenant_domains;

DROP TYPE IF EXISTS tenant_domain_status;
DROP TYPE IF EXISTS verification_method;
