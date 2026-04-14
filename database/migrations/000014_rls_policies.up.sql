-- Migration 000014: Row-Level Security Policies
-- Source: database-schema-v2.sql, Section 11 (Lines 1116-1179)
-- ALTER TABLE ENABLE ROW LEVEL SECURITY on 14 tables + all CREATE POLICY statements

-- [FIX-8] Use current_setting('app.current_tenant_id', TRUE) with SET LOCAL
-- in transaction mode for PgBouncer compatibility:
--
--   BEGIN;
--   SET LOCAL app.current_tenant_id = '<tenant-uuid>';
--   SELECT * FROM memberships;  -- RLS auto-filters
--   COMMIT;
--
-- SET LOCAL is transaction-scoped, so it doesn't leak across pooled connections.

ALTER TABLE memberships           ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_clients         ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_client_secrets  ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_consents         ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity_providers    ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups                ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_memberships     ENABLE ROW LEVEL SECURITY;
ALTER TABLE folders               ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents             ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_resources         ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_flags         ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_endpoints     ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys              ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions              ENABLE ROW LEVEL SECURITY;

-- Direct tenant_id policies
CREATE POLICY rls_memberships ON memberships
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

CREATE POLICY rls_oauth_clients ON oauth_clients
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

CREATE POLICY rls_user_consents ON user_consents
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

CREATE POLICY rls_identity_providers ON identity_providers
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

CREATE POLICY rls_groups ON groups
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

CREATE POLICY rls_folders ON folders
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

CREATE POLICY rls_documents ON documents
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

CREATE POLICY rls_api_resources ON api_resources
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

CREATE POLICY rls_feature_flags ON feature_flags
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

CREATE POLICY rls_webhook_endpoints ON webhook_endpoints
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

CREATE POLICY rls_api_keys ON api_keys
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

CREATE POLICY rls_sessions ON sessions
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

-- Indirect tenant_id (via parent FK)
CREATE POLICY rls_oauth_client_secrets ON oauth_client_secrets
    USING (client_id IN (
        SELECT id FROM oauth_clients
        WHERE tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID
    ));

CREATE POLICY rls_group_memberships ON group_memberships
    USING (group_id IN (
        SELECT id FROM groups
        WHERE tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID
    ));
