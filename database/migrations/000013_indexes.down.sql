-- Migration 000013 DOWN: Drop all indexes in reverse order

-- ── SCIM ──
DROP INDEX IF EXISTS idx_scim_sync_tenant;
DROP INDEX IF EXISTS idx_scim_tokens_tenant;

-- ── API Key Usage ──
DROP INDEX IF EXISTS idx_api_key_usage_tenant_date;
DROP INDEX IF EXISTS idx_api_key_usage_key_date;

-- ── API Keys ──
DROP INDEX IF EXISTS idx_api_keys_prefix;
DROP INDEX IF EXISTS idx_api_keys_hash;
DROP INDEX IF EXISTS idx_api_keys_tenant;

-- ── Audit Logs ──
DROP INDEX IF EXISTS idx_audit_request_id;
DROP INDEX IF EXISTS idx_audit_resource;
DROP INDEX IF EXISTS idx_audit_actor;
DROP INDEX IF EXISTS idx_audit_tenant_action;
DROP INDEX IF EXISTS idx_audit_created_brin;

-- ── Webhook Deliveries ──
DROP INDEX IF EXISTS idx_wdel_idempotency;
DROP INDEX IF EXISTS idx_wdel_status;
DROP INDEX IF EXISTS idx_wdel_tenant;
DROP INDEX IF EXISTS idx_wdel_endpoint;
DROP INDEX IF EXISTS idx_wdel_created_brin;

-- ── Webhook Endpoints ──
DROP INDEX IF EXISTS idx_webhook_endpoints_tenant;

-- ── Feature Flags ──
DROP INDEX IF EXISTS idx_feature_flags_tenant;

-- ── API Resources ──
DROP INDEX IF EXISTS idx_api_resources_app;
DROP INDEX IF EXISTS idx_api_resources_tenant;

-- ── Documents ──
DROP INDEX IF EXISTS idx_documents_title_trgm;
DROP INDEX IF EXISTS idx_documents_owner;
DROP INDEX IF EXISTS idx_documents_tenant_folder;

-- ── Folders ──
DROP INDEX IF EXISTS idx_folders_path;
DROP INDEX IF EXISTS idx_folders_tenant_parent;

-- ── Group Nesting ──
DROP INDEX IF EXISTS idx_group_nesting_child;
DROP INDEX IF EXISTS idx_group_nesting_parent;

-- ── Group Memberships ──
DROP INDEX IF EXISTS idx_group_memberships_user;
DROP INDEX IF EXISTS idx_group_memberships_group;

-- ── Groups ──
DROP INDEX IF EXISTS idx_groups_name_trgm;
DROP INDEX IF EXISTS idx_groups_tenant;

-- ── Federated Identities ──
DROP INDEX IF EXISTS idx_federated_idp_ext;
DROP INDEX IF EXISTS idx_federated_user;

-- ── Identity Providers ──
DROP INDEX IF EXISTS idx_idp_domain_hint;
DROP INDEX IF EXISTS idx_idp_tenant;

-- ── Refresh Token Families ──
DROP INDEX IF EXISTS idx_rtf_expires;
DROP INDEX IF EXISTS idx_rtf_user;

-- ── Token Deny List ──
DROP INDEX IF EXISTS idx_token_deny_list_expires;

-- ── User Consents ──
DROP INDEX IF EXISTS idx_user_consents_tenant_user;

-- ── Client Secrets ──
DROP INDEX IF EXISTS idx_client_secrets_client;

-- ── OAuth Clients ──
DROP INDEX IF EXISTS idx_oauth_clients_client_id;
DROP INDEX IF EXISTS idx_oauth_clients_tenant;

-- ── Sessions ──
DROP INDEX IF EXISTS idx_sessions_expires;
DROP INDEX IF EXISTS idx_sessions_token_hash;
DROP INDEX IF EXISTS idx_sessions_tenant_user;

-- ── MFA ──
DROP INDEX IF EXISTS idx_mfa_backup_codes_user;
DROP INDEX IF EXISTS idx_mfa_enrollments_user;

-- ── Memberships ──
DROP INDEX IF EXISTS idx_memberships_user;
DROP INDEX IF EXISTS idx_memberships_tenant_role;
DROP INDEX IF EXISTS idx_memberships_tenant_user;

-- ── Password History ──
DROP INDEX IF EXISTS idx_password_history_user;

-- ── Users ──
DROP INDEX IF EXISTS idx_users_email_trgm;
DROP INDEX IF EXISTS idx_users_name_trgm;
DROP INDEX IF EXISTS idx_users_last_login;
DROP INDEX IF EXISTS idx_users_status;
DROP INDEX IF EXISTS idx_users_email;

-- ── Tenants ──
DROP INDEX IF EXISTS idx_tenants_plan;
DROP INDEX IF EXISTS idx_tenants_domain;
DROP INDEX IF EXISTS idx_tenants_slug;
