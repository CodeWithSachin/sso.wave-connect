-- Rollback 000026: drop the functional index.
DROP INDEX IF EXISTS idx_users_email_domain;
