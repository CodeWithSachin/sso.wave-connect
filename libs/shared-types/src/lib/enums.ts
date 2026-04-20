// SSO Platform — Shared Enum Types
// Mirrors PostgreSQL enum types from database-schema-v2.sql

export type TenantPlan = 'free' | 'starter' | 'pro' | 'enterprise';

export type UserStatus = 'active' | 'suspended' | 'deactivated' | 'pending_verification';

export type MembershipRole = 'owner' | 'admin' | 'member' | 'billing_manager' | 'readonly';

export type IdpType = 'saml' | 'oidc' | 'social_google' | 'social_github' | 'social_microsoft';

export type IdpStatus = 'active' | 'inactive' | 'pending_verification';

export type OAuthGrantType = 'authorization_code' | 'refresh_token' | 'client_credentials' | 'device_code';

export type TokenAuthMethod = 'client_secret_basic' | 'client_secret_post' | 'private_key_jwt' | 'none';

export type MfaMethod = 'totp' | 'webauthn' | 'backup_code' | 'sms' | 'email';

export type MfaStatus = 'pending_setup' | 'active' | 'disabled';

export type ApiKeyStatus = 'active' | 'revoked' | 'expired';

export type SessionStatus = 'active' | 'expired' | 'revoked';

export type ConsentStatus = 'granted' | 'revoked';

export type DataResidency = 'us' | 'eu' | 'ap' | 'global';

export type AuditActorType = 'user' | 'system' | 'api_key' | 'scim_token' | 'service';

// --- Admin role surfaces (plan v2) ---
// Mirror of the `platform_admin_role` Postgres enum (migration 000018).
export type PlatformAdminRole = 'superadmin' | 'support' | 'readonly';

// Mirror of the `tenant_kind` Postgres enum (migration 000021). Distinguishes
// auto-created single-user "personal" tenants from real organizations.
export type TenantKind = 'personal' | 'organization';

// UI-facing capability vocabulary. Computed server-side from (membership role,
// tenant_kind, platform-admin role) — see apps/admin-api/src/session/capabilities.ts.
// Frontend never re-derives; it only checks `capabilities.includes(c)`.
export type Capability =
  | 'view_platform_admins'
  | 'manage_platform_admins'
  | 'view_tenant_settings'
  | 'manage_members'
  | 'manage_domains'
  | 'manage_identity_providers'
  | 'manage_invitations'
  | 'view_migrations'
  | 'force_migration'
  | 'view_audit_log';
