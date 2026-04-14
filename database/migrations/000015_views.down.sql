-- Migration 000015 DOWN: Drop all read-model views

DROP VIEW IF EXISTS v_groups_with_count;
DROP VIEW IF EXISTS v_active_sessions;
DROP VIEW IF EXISTS v_user_memberships;
