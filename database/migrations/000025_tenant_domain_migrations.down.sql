-- Rollback 000025: drop tenant_domain_migrations + its enum.
DROP TRIGGER IF EXISTS trg_tenant_domain_migrations_updated_at ON tenant_domain_migrations;
DROP INDEX IF EXISTS idx_tenant_domain_migrations_expiring;
DROP INDEX IF EXISTS idx_tenant_domain_migrations_org;
DROP INDEX IF EXISTS uq_tenant_domain_migrations_token;
DROP TABLE IF EXISTS tenant_domain_migrations;
DROP TYPE IF EXISTS migration_status;
