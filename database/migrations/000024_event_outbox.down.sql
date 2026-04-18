-- Rollback 000024: drop event_outbox and its indexes.
DROP INDEX IF EXISTS idx_event_outbox_dead_letter;
DROP INDEX IF EXISTS idx_event_outbox_tenant;
DROP INDEX IF EXISTS idx_event_outbox_ready;
DROP TABLE IF EXISTS event_outbox;
