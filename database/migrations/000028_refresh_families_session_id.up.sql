-- Migration 000028: refresh_token_families.session_id — session → family link.
--
-- Phase 5 followup: multi-tenant session switcher needs to rotate tokens for
-- a specific session without affecting the user's OTHER active sessions
-- (phone, second laptop, etc.). Today `refresh_token_families` has no link
-- back to the `sessions` row that minted it, so "revoke THIS session's
-- family" requires a user-wide revoke that would log the user out
-- everywhere.
--
-- Adding `session_id` is the narrowest fix:
--   - At family creation time (login + rotate), we stamp the session that
--     owns the family.
--   - On tenant switch, the /auth/session/rotate endpoint revokes the
--     ONE family for the current session and mints a new one for the
--     newly-active tenant.
--   - Legacy families (pre-migration) keep session_id = NULL — they behave
--     the same as before; the new behavior only kicks in for families
--     minted after this migration.

ALTER TABLE refresh_token_families
    ADD COLUMN session_id UUID REFERENCES sessions(id) ON DELETE SET NULL;

-- Hot path for "revoke the family tied to this session" (Phase 5 rotate).
-- Partial index keeps it small — we only care about non-revoked families.
CREATE INDEX idx_refresh_token_families_session
    ON refresh_token_families (session_id)
    WHERE is_revoked = FALSE AND session_id IS NOT NULL;

COMMENT ON COLUMN refresh_token_families.session_id IS
    'Session that minted this family. Populated at login/rotate; NULL for legacy rows. Phase 5 switch rotates the one family pinned to the current session without touching the user''s other sessions.';
