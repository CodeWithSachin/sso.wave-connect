-- dev-seed.sql — Development seed data
-- Creates a default tenant, admin user, and membership for local development.
--
-- Default credentials:
--   Email:    admin@sso-platform.dev
--   Password: (set via application — hash below is bcrypt of "Admin123!")

BEGIN;

-- ============================================================================
-- 1. Default Tenant
-- ============================================================================
INSERT INTO tenants (
    id,
    name,
    slug,
    display_name,
    domain,
    plan,
    data_residency,
    max_users,
    max_apps,
    is_active
) VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Default Organization',
    'default',
    'Default Organization',
    'sso-platform.dev',
    'enterprise',
    'global',
    1000,
    100,
    TRUE
) ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- 2. Default Tenant Policy
-- ============================================================================
INSERT INTO tenant_policies (
    id,
    tenant_id,
    password_min_length,
    password_require_upper,
    password_require_lower,
    password_require_number,
    password_require_symbol,
    password_require_mfa,
    session_max_age_hours,
    idle_timeout_minutes,
    max_sessions_per_user,
    password_history_count,
    lockout_threshold,
    lockout_duration_min
) VALUES (
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000001',
    12,
    TRUE,
    TRUE,
    TRUE,
    FALSE,
    FALSE,
    24,
    60,
    10,
    5,
    5,
    30
) ON CONFLICT (tenant_id) DO NOTHING;

-- ============================================================================
-- 3. Admin User
-- ============================================================================
-- Password hash is bcrypt of "Admin123!" — ONLY for local dev, never production.
INSERT INTO users (
    id,
    email,
    email_verified,
    password_hash,
    display_name,
    first_name,
    last_name,
    status,
    last_login_at,
    password_changed_at
) VALUES (
    '00000000-0000-0000-0000-000000000002',
    'admin@sso-platform.dev',
    TRUE,
    '$2a$12$LJ3m4ys3Lgx/XBdGMJ6oiOGMHkn5QFMWJ1VKsBPfGAl4.KjYMh0.',
    'Platform Admin',
    'Platform',
    'Admin',
    'active',
    NOW(),
    NOW()
) ON CONFLICT (email) DO NOTHING;

-- ============================================================================
-- 4. Admin Membership (owner role)
-- ============================================================================
INSERT INTO memberships (
    id,
    user_id,
    tenant_id,
    role,
    joined_at,
    created_by
) VALUES (
    '00000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    'owner',
    NOW(),
    '00000000-0000-0000-0000-000000000002'
) ON CONFLICT (tenant_id, user_id) DO NOTHING;

COMMIT;
