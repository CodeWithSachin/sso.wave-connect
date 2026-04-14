-- Migration 000007 DOWN: Drop group tables

DROP TRIGGER IF EXISTS trg_groups_updated_at ON groups;

DROP TABLE IF EXISTS group_nesting;
DROP TABLE IF EXISTS group_memberships;
DROP TABLE IF EXISTS groups;
