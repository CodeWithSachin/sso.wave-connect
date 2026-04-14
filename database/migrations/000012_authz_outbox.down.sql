-- Migration 000012 DOWN: Drop authorization outbox and permission cache

DROP INDEX IF EXISTS idx_perm_cache_tenant;
DROP INDEX IF EXISTS idx_perm_cache_expires;
DROP INDEX IF EXISTS idx_authz_outbox_actor;
DROP INDEX IF EXISTS idx_authz_outbox_object;
DROP INDEX IF EXISTS idx_authz_outbox_pending;

DROP TABLE IF EXISTS permission_cache;
DROP TABLE IF EXISTS authz_outbox;
