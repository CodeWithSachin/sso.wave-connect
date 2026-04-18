-- Rollback 000028: drop session link + index.
DROP INDEX IF EXISTS idx_refresh_token_families_session;
ALTER TABLE refresh_token_families DROP COLUMN IF EXISTS session_id;
