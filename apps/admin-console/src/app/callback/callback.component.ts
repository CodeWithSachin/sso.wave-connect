import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { environment } from '../environments/environment';

/**
 * OAuth2 callback handler.
 * Receives the authorization code from sso-service, exchanges it for tokens via PKCE,
 * stores tokens in sessionStorage, and navigates to the dashboard.
 */
@Component({
  selector: 'app-callback',
  standalone: true,
  template: `
    <div class="flex h-screen items-center justify-center bg-background">
      <div class="text-center">
        <div class="mb-4 h-8 w-8 mx-auto animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
        <p class="text-sm text-muted-foreground">{{ message }}</p>
      </div>
    </div>
  `,
})
export class CallbackComponent implements OnInit {
  message = 'Completing sign-in...';

  constructor(private readonly router: Router) {}

  async ngOnInit() {
    try {
      await this.handleCallback();
    } catch (err) {
      this.message = `Authentication failed: ${(err as Error).message}`;
    }
  }

  private async handleCallback(): Promise<void> {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const error = params.get('error');

    if (error) {
      throw new Error(params.get('error_description') || error);
    }

    if (!code || !state) {
      throw new Error('Missing authorization code or state');
    }

    // Verify state to prevent CSRF
    const savedState = sessionStorage.getItem('oauth_state');
    if (state !== savedState) {
      throw new Error('State mismatch — possible CSRF attack');
    }

    // Retrieve PKCE verifier
    const verifier = sessionStorage.getItem('pkce_verifier');
    if (!verifier) {
      throw new Error('Missing PKCE verifier — session may have expired');
    }

    // Exchange authorization code for tokens
    const tokenBody = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: environment.oauthRedirectUri,
      client_id: environment.oauthClientId,
      code_verifier: verifier,
    });

    const response = await fetch(`${environment.ssoServiceUrl}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody.toString(),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}) as Record<string, string>);
      const errObj = err as Record<string, string>;
      throw new Error(
        errObj['error_description'] ||
          errObj['error'] ||
          `Token exchange failed (${response.status})`,
      );
    }

    const tokens = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      id_token?: string;
      expires_in: number;
      scope?: string;
      tenant_id?: string;
    };

    // Store tokens in sessionStorage
    sessionStorage.setItem('accessToken', tokens.access_token);
    if (tokens.refresh_token) {
      sessionStorage.setItem('refreshToken', tokens.refresh_token);
    }
    if (tokens.id_token) {
      sessionStorage.setItem('idToken', tokens.id_token);
    }
    if (tokens.tenant_id) {
      sessionStorage.setItem('tenantId', tokens.tenant_id);
    }

    // Clean up PKCE state
    sessionStorage.removeItem('pkce_verifier');
    sessionStorage.removeItem('oauth_state');

    // Clean the URL and navigate to dashboard
    this.router.navigateByUrl('/dashboard');
  }
}
