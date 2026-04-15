import { CanActivateFn } from '@angular/router';
import { environment } from '../environments/environment';

/**
 * Guard that checks if the user has a valid access token.
 *
 * Flow:
 * 1. Check URL hash for tokens (passed by login-portal after cross-origin redirect)
 * 2. If found, store them in sessionStorage and clean the URL
 * 3. Check sessionStorage for existing tokens
 * 4. If no tokens, redirect to login-portal with returnUrl
 */
export const authGuard: CanActivateFn = () => {
  // 1. Check URL hash fragment for tokens from login-portal redirect
  if (window.location.hash) {
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const accessToken = hashParams.get('access_token');
    const tenantId = hashParams.get('tenant_id');

    if (accessToken && tenantId) {
      sessionStorage.setItem('accessToken', accessToken);
      sessionStorage.setItem('tenantId', tenantId);

      const refreshToken = hashParams.get('refresh_token');
      if (refreshToken) sessionStorage.setItem('refreshToken', refreshToken);

      const idToken = hashParams.get('id_token');
      if (idToken) sessionStorage.setItem('idToken', idToken);

      // Clean the hash from the URL
      history.replaceState(null, '', window.location.pathname + window.location.search);
      return true;
    }
  }

  // 2. Check sessionStorage
  const token = sessionStorage.getItem('accessToken');
  const tenantId = sessionStorage.getItem('tenantId');

  if (token && tenantId) {
    return true;
  }

  // 3. Redirect to login-portal
  const returnUrl = encodeURIComponent(window.location.origin + window.location.pathname);
  window.location.href = `${environment.loginPortalUrl}/login?returnUrl=${returnUrl}`;
  return false;
};
