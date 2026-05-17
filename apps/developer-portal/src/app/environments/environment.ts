export const environment = {
  production: false,
  devPortalApiUrl: 'http://localhost:3500',
  identityServiceUrl: 'http://localhost:3000',
  // audit-service backs the 30-day usage metric on the dashboard and the
  // future /activity feed. Same hostname as admin-console's env.
  auditServiceUrl: 'http://localhost:3400',
  // webhook-service hosts /api/v1/webhooks endpoints (endpoints + deliveries
  // + replay). Developer-portal calls it directly; no proxy needed.
  webhookServiceUrl: 'http://localhost:3300',
  ssoServiceUrl: 'http://localhost:8083',
  oauthClientId: 'developer-portal',
  oauthRedirectUri: 'http://localhost:4302/callback',
  // Canonical "signed out" URL. Logout sends the user here so a revoked
  // sso_session cookie can't silently re-auth them back onto the dashboard.
  loginPortalUrl: 'http://localhost:4300/login',
};
