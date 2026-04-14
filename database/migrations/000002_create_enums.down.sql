-- Migration 000002 DOWN: Drop webhook_event_types table and all enum types in reverse order

DROP TABLE IF EXISTS webhook_event_types;

DROP TYPE IF EXISTS audit_actor_type;
DROP TYPE IF EXISTS data_residency;
DROP TYPE IF EXISTS consent_status;
DROP TYPE IF EXISTS session_status;
DROP TYPE IF EXISTS api_key_status;
DROP TYPE IF EXISTS mfa_status;
DROP TYPE IF EXISTS mfa_method;
DROP TYPE IF EXISTS token_auth_method;
DROP TYPE IF EXISTS oauth_grant_type;
DROP TYPE IF EXISTS idp_status;
DROP TYPE IF EXISTS idp_type;
DROP TYPE IF EXISTS membership_role;
DROP TYPE IF EXISTS user_status;
DROP TYPE IF EXISTS tenant_plan;
