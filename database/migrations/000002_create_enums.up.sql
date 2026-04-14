-- Migration 000002: Enum Types & webhook_event_types Reference Table
-- Source: database-schema-v2.sql, Section 0.2 (Lines 78-117)
-- All 14 CREATE TYPE statements + webhook_event_types table + seed data

CREATE TYPE tenant_plan         AS ENUM ('free', 'starter', 'pro', 'enterprise');
CREATE TYPE user_status         AS ENUM ('active', 'suspended', 'deactivated', 'pending_verification');
CREATE TYPE membership_role     AS ENUM ('owner', 'admin', 'member', 'billing_manager', 'readonly');
CREATE TYPE idp_type            AS ENUM ('saml', 'oidc', 'social_google', 'social_github', 'social_microsoft');
CREATE TYPE idp_status          AS ENUM ('active', 'inactive', 'pending_verification');
CREATE TYPE oauth_grant_type    AS ENUM ('authorization_code', 'refresh_token', 'client_credentials', 'device_code');
CREATE TYPE token_auth_method   AS ENUM ('client_secret_basic', 'client_secret_post', 'private_key_jwt', 'none');
CREATE TYPE mfa_method          AS ENUM ('totp', 'webauthn', 'backup_code', 'sms', 'email');
CREATE TYPE mfa_status          AS ENUM ('pending_setup', 'active', 'disabled');
CREATE TYPE api_key_status      AS ENUM ('active', 'revoked', 'expired');
CREATE TYPE session_status      AS ENUM ('active', 'expired', 'revoked');
CREATE TYPE consent_status      AS ENUM ('granted', 'revoked');
CREATE TYPE data_residency      AS ENUM ('us', 'eu', 'ap', 'global');
CREATE TYPE audit_actor_type    AS ENUM ('user', 'system', 'api_key', 'scim_token', 'service');

-- [FIX-5] webhook_event_type is NOT an enum -- it's a VARCHAR.
-- Reason: you'll add new event types monthly. ALTER TYPE ... ADD VALUE is
-- non-transactional (can't rollback) and you can NEVER remove values.
-- Use a CHECK constraint + a reference table instead.

CREATE TABLE webhook_event_types (
    name        VARCHAR(100) PRIMARY KEY,
    category    VARCHAR(50)  NOT NULL,      -- 'user', 'group', 'permission', 'session', etc.
    description TEXT,
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

INSERT INTO webhook_event_types (name, category) VALUES
    ('user.created', 'user'), ('user.updated', 'user'), ('user.deleted', 'user'),
    ('user.login', 'user'), ('user.logout', 'user'),
    ('user.mfa_enrolled', 'user'), ('user.mfa_removed', 'user'), ('user.password_changed', 'user'),
    ('membership.created', 'membership'), ('membership.updated', 'membership'), ('membership.deleted', 'membership'),
    ('group.created', 'group'), ('group.updated', 'group'), ('group.deleted', 'group'),
    ('group.member_added', 'group'), ('group.member_removed', 'group'),
    ('permission.granted', 'permission'), ('permission.revoked', 'permission'),
    ('session.created', 'session'), ('session.revoked', 'session'),
    ('app.created', 'app'), ('app.updated', 'app'), ('app.deleted', 'app'),
    ('idp.created', 'idp'), ('idp.updated', 'idp'), ('idp.deleted', 'idp'),
    ('tenant.updated', 'tenant'), ('tenant.plan_changed', 'tenant');
