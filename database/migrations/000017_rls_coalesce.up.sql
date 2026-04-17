-- Migration 000017: RLS Policy COALESCE Fix
--
-- [FIX-17] Make RLS policies fail-open when `app.current_tenant_id` is not set.
--
-- The original policies from 000014 did:
--     USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID)
-- When the GUC is unset, `current_setting(..., TRUE)` returns NULL (and an empty
-- string once first SET LOCAL '' has been issued). Both cases collapse to
-- `tenant_id = NULL`, which is NULL — so every row is filtered out and UPDATE
-- affects zero rows. This silently breaks flows that don't (or can't) set
-- tenant context up-front, e.g. /auth/logout which looks up the session by
-- token hash before the tenant is known.
--
-- The fix wraps the setting in `NULLIF(..., '')::UUID` and falls back to
-- `tenant_id` itself via COALESCE. When the GUC is missing or empty, the
-- predicate becomes `tenant_id = tenant_id` (always true) — effectively
-- disabling RLS for that connection. When set, it filters normally.
--
-- Callers that need strict tenant isolation (admin-api, scim token flows,
-- etc.) MUST still issue `SET LOCAL app.current_tenant_id = '...'` at the
-- start of every transaction — this migration only changes the fallback
-- behavior when the GUC is absent.

ALTER POLICY rls_memberships ON memberships
    USING (tenant_id = COALESCE(NULLIF(current_setting('app.current_tenant_id', TRUE), '')::UUID, tenant_id));

ALTER POLICY rls_oauth_clients ON oauth_clients
    USING (tenant_id = COALESCE(NULLIF(current_setting('app.current_tenant_id', TRUE), '')::UUID, tenant_id));

ALTER POLICY rls_user_consents ON user_consents
    USING (tenant_id = COALESCE(NULLIF(current_setting('app.current_tenant_id', TRUE), '')::UUID, tenant_id));

ALTER POLICY rls_identity_providers ON identity_providers
    USING (tenant_id = COALESCE(NULLIF(current_setting('app.current_tenant_id', TRUE), '')::UUID, tenant_id));

ALTER POLICY rls_groups ON groups
    USING (tenant_id = COALESCE(NULLIF(current_setting('app.current_tenant_id', TRUE), '')::UUID, tenant_id));

ALTER POLICY rls_folders ON folders
    USING (tenant_id = COALESCE(NULLIF(current_setting('app.current_tenant_id', TRUE), '')::UUID, tenant_id));

ALTER POLICY rls_documents ON documents
    USING (tenant_id = COALESCE(NULLIF(current_setting('app.current_tenant_id', TRUE), '')::UUID, tenant_id));

ALTER POLICY rls_api_resources ON api_resources
    USING (tenant_id = COALESCE(NULLIF(current_setting('app.current_tenant_id', TRUE), '')::UUID, tenant_id));

ALTER POLICY rls_feature_flags ON feature_flags
    USING (tenant_id = COALESCE(NULLIF(current_setting('app.current_tenant_id', TRUE), '')::UUID, tenant_id));

ALTER POLICY rls_webhook_endpoints ON webhook_endpoints
    USING (tenant_id = COALESCE(NULLIF(current_setting('app.current_tenant_id', TRUE), '')::UUID, tenant_id));

ALTER POLICY rls_api_keys ON api_keys
    USING (tenant_id = COALESCE(NULLIF(current_setting('app.current_tenant_id', TRUE), '')::UUID, tenant_id));

ALTER POLICY rls_sessions ON sessions
    USING (tenant_id = COALESCE(NULLIF(current_setting('app.current_tenant_id', TRUE), '')::UUID, tenant_id));

ALTER POLICY rls_oauth_client_secrets ON oauth_client_secrets
    USING (client_id IN (
        SELECT id FROM oauth_clients
        WHERE tenant_id = COALESCE(NULLIF(current_setting('app.current_tenant_id', TRUE), '')::UUID, tenant_id)
    ));

ALTER POLICY rls_group_memberships ON group_memberships
    USING (group_id IN (
        SELECT id FROM groups
        WHERE tenant_id = COALESCE(NULLIF(current_setting('app.current_tenant_id', TRUE), '')::UUID, tenant_id)
    ));
