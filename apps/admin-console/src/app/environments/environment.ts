export const environment = {
  production: false,
  adminApiUrl: 'http://localhost:3100',
  identityServiceUrl: 'http://localhost:3000',
  ssoServiceUrl: 'http://localhost:8083',
  webhookServiceUrl: 'http://localhost:3300',
  auditServiceUrl: 'http://localhost:3400',
  directoryServiceUrl: 'http://localhost:3200',
  // OAuth2 PKCE config for admin-console
  oauthClientId: 'admin-console',
  oauthRedirectUri: 'http://localhost:4300/callback',
};
