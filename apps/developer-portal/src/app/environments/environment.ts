export const environment = {
  production: false,
  devPortalApiUrl: 'http://localhost:3500',
  identityServiceUrl: 'http://localhost:3000',
  ssoServiceUrl: 'http://localhost:8083',
  oauthClientId: 'developer-portal',
  oauthRedirectUri: 'http://localhost:4302/callback',
  // Canonical "signed out" URL. Logout sends the user here so a revoked
  // sso_session cookie can't silently re-auth them back onto the dashboard.
  loginPortalUrl: 'http://localhost:4300/login',
};
