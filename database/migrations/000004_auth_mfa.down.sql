-- Migration 000004 DOWN: Drop authentication & MFA tables

DROP TRIGGER IF EXISTS trg_mfa_enrollments_updated_at ON mfa_enrollments;

DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS mfa_backup_codes;
DROP TABLE IF EXISTS mfa_enrollments;
