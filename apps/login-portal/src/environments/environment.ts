export const environment = {
  production: false,
  identityServiceUrl: 'http://localhost:3000',
  adminApiUrl: 'http://localhost:3100',
  tenantId: '01473191-863b-4035-ac65-05782ca6159b',
  // Where to send the user after a successful login when the request didn't
  // carry a ?return_to query param (direct /login visit, bookmark, old
  // email link, etc). Without this the old code looped the user back to
  // /login even though their session was valid.
  defaultPostLoginUrl: 'http://localhost:4301/dashboard',
};
