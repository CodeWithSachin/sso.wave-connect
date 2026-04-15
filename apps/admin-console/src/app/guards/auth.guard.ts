import { CanActivateFn } from '@angular/router';
import { environment } from '../environments/environment';
import {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
} from '../services/pkce.service';

/**
 * OAuth2 PKCE auth guard for the admin-console.
 *
 * Flow:
 * 1. Check sessionStorage for existing accessToken → allow if present
 * 2. Otherwise, generate PKCE verifier/challenge + state
 * 3. Store verifier + state in sessionStorage (survive the redirect round-trip)
 * 4. Redirect to sso-service /oauth2/authorize with PKCE params
 * 5. sso-service checks sso_session cookie → if valid, issues auth code silently
 * 6. Redirect back to /callback with code → callback exchanges for tokens
 */
export const authGuard: CanActivateFn = async () => {
  const token = sessionStorage.getItem('accessToken');
  if (token) {
    return true;
  }

  // Generate PKCE parameters
  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  const state = generateState();

  // Store for the callback to use after redirect
  sessionStorage.setItem('pkce_verifier', verifier);
  sessionStorage.setItem('oauth_state', state);

  // Build the OAuth2 authorize URL
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: environment.oauthClientId,
    redirect_uri: environment.oauthRedirectUri,
    scope: 'openid profile email',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });

  window.location.href = `${environment.ssoServiceUrl}/oauth2/authorize?${params.toString()}`;
  return false;
};
