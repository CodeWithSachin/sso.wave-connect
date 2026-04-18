-- Migration 000021 DOWN: Drop email_verification_tokens + tenant_kind.

DROP INDEX IF EXISTS idx_email_verification_tokens_active;
DROP TABLE IF EXISTS email_verification_tokens;

DROP INDEX IF EXISTS idx_tenants_personal;
ALTER TABLE tenants DROP COLUMN IF EXISTS tenant_kind;
DROP TYPE IF EXISTS tenant_kind;
