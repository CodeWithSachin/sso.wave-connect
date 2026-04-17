-- Migration 000017 DOWN: Revert RLS policies to strict comparison (no COALESCE fallback).

ALTER POLICY rls_memberships ON memberships
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

ALTER POLICY rls_oauth_clients ON oauth_clients
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

ALTER POLICY rls_user_consents ON user_consents
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

ALTER POLICY rls_identity_providers ON identity_providers
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

ALTER POLICY rls_groups ON groups
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

ALTER POLICY rls_folders ON folders
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

ALTER POLICY rls_documents ON documents
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

ALTER POLICY rls_api_resources ON api_resources
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

ALTER POLICY rls_feature_flags ON feature_flags
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

ALTER POLICY rls_webhook_endpoints ON webhook_endpoints
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

ALTER POLICY rls_api_keys ON api_keys
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

ALTER POLICY rls_sessions ON sessions
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

ALTER POLICY rls_oauth_client_secrets ON oauth_client_secrets
    USING (client_id IN (
        SELECT id FROM oauth_clients
        WHERE tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID
    ));

ALTER POLICY rls_group_memberships ON group_memberships
    USING (group_id IN (
        SELECT id FROM groups
        WHERE tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID
    ));
