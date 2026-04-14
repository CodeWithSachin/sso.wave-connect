-- Migration 000013: All Indexes
-- Source: database-schema-v2.sql, Section 10 (Lines 982-1100)
-- 55+ indexes organized by table section

-- ── Tenants ──
CREATE INDEX idx_tenants_slug ON tenants (slug) WHERE deleted_at IS NULL;
CREATE INDEX idx_tenants_domain ON tenants (domain) WHERE domain IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_tenants_plan ON tenants (plan) WHERE is_active = TRUE;

-- ── Users ──
CREATE INDEX idx_users_email ON users (email) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_status ON users (status) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_last_login ON users (last_login_at DESC NULLS LAST) WHERE status = 'active';
CREATE INDEX idx_users_name_trgm ON users USING GIN (display_name gin_trgm_ops) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_email_trgm ON users USING GIN ((email::TEXT) gin_trgm_ops) WHERE deleted_at IS NULL;
-- [FIX-11] JSONB index only if you query metadata (e.g., SCIM attributes)
-- CREATE INDEX idx_users_metadata ON users USING GIN (metadata jsonb_path_ops) WHERE deleted_at IS NULL;

-- ── Password History ──
CREATE INDEX idx_password_history_user ON password_history (user_id, created_at DESC);

-- ── Memberships ──
-- [FIX-2] tenant_id FIRST in all composite indexes -- matches RLS filter
CREATE INDEX idx_memberships_tenant_user ON memberships (tenant_id, user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_memberships_tenant_role ON memberships (tenant_id, role) WHERE deleted_at IS NULL;
CREATE INDEX idx_memberships_user ON memberships (user_id) WHERE deleted_at IS NULL;

-- ── MFA ──
CREATE INDEX idx_mfa_enrollments_user ON mfa_enrollments (user_id, status);
CREATE INDEX idx_mfa_backup_codes_user ON mfa_backup_codes (user_id) WHERE used_at IS NULL;

-- ── Sessions ──
-- [FIX-2] tenant_id FIRST
CREATE INDEX idx_sessions_tenant_user ON sessions (tenant_id, user_id) WHERE status = 'active';
CREATE INDEX idx_sessions_token_hash ON sessions (token_hash);
CREATE INDEX idx_sessions_expires ON sessions (expires_at) WHERE status = 'active';

-- ── OAuth Clients ──
CREATE INDEX idx_oauth_clients_tenant ON oauth_clients (tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_oauth_clients_client_id ON oauth_clients (client_id) WHERE is_active = TRUE;

-- ── Client Secrets ──
CREATE INDEX idx_client_secrets_client ON oauth_client_secrets (client_id) WHERE is_active = TRUE;

-- ── User Consents ──
CREATE INDEX idx_user_consents_tenant_user ON user_consents (tenant_id, user_id);

-- ── Token Deny List ──
CREATE INDEX idx_token_deny_list_expires ON token_deny_list (expires_at);

-- ── Refresh Token Families ──
CREATE INDEX idx_rtf_user ON refresh_token_families (user_id) WHERE is_revoked = FALSE;
CREATE INDEX idx_rtf_expires ON refresh_token_families (expires_at) WHERE is_revoked = FALSE;

-- ── Identity Providers ──
CREATE INDEX idx_idp_tenant ON identity_providers (tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_idp_domain_hint ON identity_providers (domain_hint) WHERE status = 'active' AND deleted_at IS NULL;

-- ── Federated Identities ──
CREATE INDEX idx_federated_user ON federated_identities (user_id);
CREATE INDEX idx_federated_idp_ext ON federated_identities (idp_id, external_user_id);

-- ── Groups ──
CREATE INDEX idx_groups_tenant ON groups (tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_groups_name_trgm ON groups USING GIN (name gin_trgm_ops) WHERE deleted_at IS NULL;

-- ── Group Memberships ──
CREATE INDEX idx_group_memberships_group ON group_memberships (group_id);
CREATE INDEX idx_group_memberships_user ON group_memberships (user_id);

-- ── Group Nesting ──
CREATE INDEX idx_group_nesting_parent ON group_nesting (parent_group_id);
CREATE INDEX idx_group_nesting_child ON group_nesting (child_group_id);

-- ── Folders ──
CREATE INDEX idx_folders_tenant_parent ON folders (tenant_id, parent_id) WHERE deleted_at IS NULL;  -- [FIX-2]
CREATE INDEX idx_folders_path ON folders (tenant_id, path) WHERE deleted_at IS NULL;

-- ── Documents ──
CREATE INDEX idx_documents_tenant_folder ON documents (tenant_id, folder_id) WHERE deleted_at IS NULL; -- [FIX-2]
CREATE INDEX idx_documents_owner ON documents (owner_user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_documents_title_trgm ON documents USING GIN (title gin_trgm_ops) WHERE deleted_at IS NULL;

-- ── API Resources ──
CREATE INDEX idx_api_resources_tenant ON api_resources (tenant_id);
CREATE INDEX idx_api_resources_app ON api_resources (application_id);

-- ── Feature Flags ──
CREATE INDEX idx_feature_flags_tenant ON feature_flags (tenant_id);

-- ── Webhook Endpoints ──
CREATE INDEX idx_webhook_endpoints_tenant ON webhook_endpoints (tenant_id) WHERE is_active = TRUE;

-- ── Webhook Deliveries ──
-- [FIX-10] BRIN for timestamp-monotonic partitioned data (100x smaller than B-tree)
CREATE INDEX idx_wdel_created_brin ON webhook_deliveries USING BRIN (created_at) WITH (pages_per_range = 32);
CREATE INDEX idx_wdel_endpoint ON webhook_deliveries (endpoint_id, created_at DESC);
CREATE INDEX idx_wdel_tenant ON webhook_deliveries (tenant_id, created_at DESC);
CREATE INDEX idx_wdel_status ON webhook_deliveries (status) WHERE status IN ('pending', 'retrying');
-- [FIX-6] Idempotency lookup
CREATE INDEX idx_wdel_idempotency ON webhook_deliveries (idempotency_key) WHERE idempotency_key IS NOT NULL;

-- ── Audit Logs ──
-- [FIX-10] BRIN for the time column (append-only = perfectly monotonic)
CREATE INDEX idx_audit_created_brin ON audit_logs USING BRIN (created_at) WITH (pages_per_range = 32);
CREATE INDEX idx_audit_tenant_action ON audit_logs (tenant_id, action, created_at DESC);
CREATE INDEX idx_audit_actor ON audit_logs (actor_id, created_at DESC) WHERE actor_id IS NOT NULL;
CREATE INDEX idx_audit_resource ON audit_logs (resource_type, resource_id, created_at DESC);
CREATE INDEX idx_audit_request_id ON audit_logs (request_id) WHERE request_id IS NOT NULL;

-- ── API Keys ──
CREATE INDEX idx_api_keys_tenant ON api_keys (tenant_id) WHERE status = 'active';
CREATE INDEX idx_api_keys_hash ON api_keys (key_hash);
CREATE INDEX idx_api_keys_prefix ON api_keys (key_prefix) WHERE status = 'active';

-- ── API Key Usage ──
CREATE INDEX idx_api_key_usage_key_date ON api_key_usage (api_key_id, date DESC);
CREATE INDEX idx_api_key_usage_tenant_date ON api_key_usage (tenant_id, date DESC);

-- ── SCIM ──
CREATE INDEX idx_scim_tokens_tenant ON scim_tokens (tenant_id) WHERE is_active = TRUE;
CREATE INDEX idx_scim_sync_tenant ON scim_sync_log (tenant_id, created_at DESC);
