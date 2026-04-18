-- Migration 000018 DOWN: Drop platform_admins table + enum.

DROP INDEX IF EXISTS idx_platform_admins_active;
DROP TABLE IF EXISTS platform_admins;
DROP TYPE IF EXISTS platform_admin_role;
