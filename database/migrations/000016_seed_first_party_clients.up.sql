-- Migration 000016: Seed first-party OAuth2 clients for SSO
-- These are the platform's own apps — consent is skipped, PKCE is required.

-- Dev tenant ID from login-portal environment.ts
-- In production, create per-tenant clients via admin-api.

INSERT INTO oauth_clients (
    tenant_id,
    client_id,
    name,
    description,
    redirect_uris,
    allowed_grant_types,
    allowed_scopes,
    token_endpoint_auth_method,
    is_first_party,
    is_public,
    require_pkce,
    require_consent,
    is_active
) VALUES
-- Admin Console (Angular SPA on port 4301)
(
    '01473191-863b-4035-ac65-05782ca6159b',
    'admin-console',
    'Admin Console',
    'WaveConnect SSO Admin Dashboard',
    ARRAY['http://localhost:4301/callback'],
    ARRAY['authorization_code', 'refresh_token']::oauth_grant_type[],
    ARRAY['openid', 'profile', 'email'],
    'none',
    TRUE,       -- first-party: skip consent
    TRUE,       -- public client (SPA, no client secret)
    TRUE,       -- PKCE required
    FALSE,      -- no consent screen
    TRUE
),
-- Login Portal (Angular SPA on port 4300)
(
    '01473191-863b-4035-ac65-05782ca6159b',
    'login-portal',
    'Login Portal',
    'WaveConnect SSO Login & Authentication Portal',
    ARRAY['http://localhost:4300/callback'],
    ARRAY['authorization_code', 'refresh_token']::oauth_grant_type[],
    ARRAY['openid', 'profile', 'email'],
    'none',
    TRUE,
    TRUE,
    TRUE,
    FALSE,
    TRUE
),
-- Developer Portal (Angular SPA on port 4302)
(
    '01473191-863b-4035-ac65-05782ca6159b',
    'developer-portal',
    'Developer Portal',
    'WaveConnect SSO Developer Portal — API keys, SDKs, OAuth app management',
    ARRAY['http://localhost:4302/callback'],
    ARRAY['authorization_code', 'refresh_token']::oauth_grant_type[],
    ARRAY['openid', 'profile', 'email'],
    'none',
    TRUE,
    TRUE,
    TRUE,
    FALSE,
    TRUE
)
ON CONFLICT (client_id) DO NOTHING;
