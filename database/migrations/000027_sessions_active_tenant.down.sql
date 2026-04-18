-- Rollback 000027: drop active_tenant_id and its index.
DROP INDEX IF EXISTS idx_sessions_active_tenant;
ALTER TABLE sessions DROP COLUMN IF EXISTS active_tenant_id;
