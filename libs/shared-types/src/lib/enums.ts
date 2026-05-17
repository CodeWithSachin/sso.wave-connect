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

// Capability vocabulary shared by both consoles + their backing NestJS
// services. Computed server-side from (membership role, tenant_kind,
// platform-admin role) in `libs/nestjs-auth/src/lib/capabilities.ts`
// (single source of truth — see ADR-0002 for the unified RBAC design).
//
// Frontend never re-derives; it only checks `capabilities.includes(c)`.
// Backend gates writes via `@RequireCapability(...)` from libs/nestjs-auth.
//
// Categories below are organizational only; the union is flat.
export type Capability =
  // --- Platform tier (admin-console only) ---
  | 'view_platform_admins'
  | 'manage_platform_admins'
  | 'view_tenant_settings'
  | 'view_audit_log'
  // --- Tenant-admin tier (admin-console) ---
  // read_members is additive to manage_members so billing_manager / readonly
  // can see the team list without inheriting writeful manage_* (Item 1.2).
  | 'read_members'
  | 'manage_members'
  | 'manage_domains'
  | 'manage_identity_providers'
  | 'manage_invitations'
  | 'view_migrations'
  | 'force_migration'
  // --- Developer tier (developer-portal) — ADR-0002 §A2 ---
  // read_* developer caps are additive to manage_* (Item 1.2): they gate
  // GET list/detail routes so audit/billing roles can review usage without
  // rotating keys or editing apps.
  | 'view_developer_resources'
  | 'read_api_keys'
  | 'manage_api_keys'
  | 'read_oauth_apps'
  | 'manage_oauth_apps'
  | 'read_webhooks'
  | 'manage_webhooks'
  | 'manage_scim_tokens';
