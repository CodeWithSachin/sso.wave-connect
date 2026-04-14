-- Migration 000015: Read-Model Views
-- Source: database-schema-v2.sql, Section 12 (Lines 1187-1236)
-- Views: v_user_memberships, v_active_sessions, v_groups_with_count
-- [FIX-15] Avoid JOINs in Hot Paths

-- User with their memberships (used by admin-api list users endpoint)
CREATE VIEW v_user_memberships AS
SELECT
    u.id AS user_id,
    u.email,
    u.display_name,
    u.status AS user_status,
    u.last_login_at,
    m.tenant_id,
    m.role,
    m.joined_at
FROM users u
JOIN memberships m ON m.user_id = u.id
WHERE u.deleted_at IS NULL
  AND m.deleted_at IS NULL;

-- Active sessions with user info (used by session management page)
CREATE VIEW v_active_sessions AS
SELECT
    s.id AS session_id,
    s.user_id,
    u.email,
    u.display_name,
    s.tenant_id,
    s.ip_address,
    s.country_code,
    s.city,
    s.user_agent,
    s.mfa_verified,
    s.last_activity_at,
    s.expires_at,
    s.created_at
FROM sessions s
JOIN users u ON u.id = s.user_id
WHERE s.status = 'active';

-- Group with member count (used by group listing page)
CREATE VIEW v_groups_with_count AS
SELECT
    g.id AS group_id,
    g.tenant_id,
    g.name,
    g.slug,
    g.is_managed,
    g.source,
    COUNT(gm.id) AS member_count,
    g.created_at
FROM groups g
LEFT JOIN group_memberships gm ON gm.group_id = g.id
WHERE g.deleted_at IS NULL
GROUP BY g.id;
