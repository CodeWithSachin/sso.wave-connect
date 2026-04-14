-- Migration 000014 DOWN: Drop all RLS policies and disable RLS

DROP POLICY IF EXISTS rls_group_memberships ON group_memberships;
DROP POLICY IF EXISTS rls_oauth_client_secrets ON oauth_client_secrets;
DROP POLICY IF EXISTS rls_sessions ON sessions;
DROP POLICY IF EXISTS rls_api_keys ON api_keys;
DROP POLICY IF EXISTS rls_webhook_endpoints ON webhook_endpoints;
DROP POLICY IF EXISTS rls_feature_flags ON feature_flags;
DROP POLICY IF EXISTS rls_api_resources ON api_resources;
DROP POLICY IF EXISTS rls_documents ON documents;
DROP POLICY IF EXISTS rls_folders ON folders;
DROP POLICY IF EXISTS rls_groups ON groups;
DROP POLICY IF EXISTS rls_identity_providers ON identity_providers;
DROP POLICY IF EXISTS rls_user_consents ON user_consents;
DROP POLICY IF EXISTS rls_oauth_clients ON oauth_clients;
DROP POLICY IF EXISTS rls_memberships ON memberships;

ALTER TABLE sessions              DISABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys              DISABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_endpoints     DISABLE ROW LEVEL SECURITY;
ALTER TABLE feature_flags         DISABLE ROW LEVEL SECURITY;
ALTER TABLE api_resources         DISABLE ROW LEVEL SECURITY;
ALTER TABLE documents             DISABLE ROW LEVEL SECURITY;
ALTER TABLE folders               DISABLE ROW LEVEL SECURITY;
ALTER TABLE group_memberships     DISABLE ROW LEVEL SECURITY;
ALTER TABLE groups                DISABLE ROW LEVEL SECURITY;
ALTER TABLE identity_providers    DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_consents         DISABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_client_secrets  DISABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_clients         DISABLE ROW LEVEL SECURITY;
ALTER TABLE memberships           DISABLE ROW LEVEL SECURITY;
