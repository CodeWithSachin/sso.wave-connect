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
