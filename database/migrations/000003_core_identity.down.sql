-- Migration 000003 DOWN: Drop core identity tables in reverse FK order

DROP TRIGGER IF EXISTS trg_memberships_updated_at ON memberships;
DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
DROP TRIGGER IF EXISTS trg_tenant_policies_updated_at ON tenant_policies;
DROP TRIGGER IF EXISTS trg_tenants_updated_at ON tenants;

DROP TABLE IF EXISTS memberships;
DROP TABLE IF EXISTS password_history;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS tenant_policies;
DROP TABLE IF EXISTS tenants;
