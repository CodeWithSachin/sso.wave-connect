import { computed, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import {
  signalStore,
  withState,
  withComputed,
  withMethods,
  patchState,
} from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

export interface User {
  id: string;
  email: string;
  display_name: string;
  avatar_url?: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  id_token?: string;
  session_id?: string;
  expires_in: number;
  token_type: string;
  user: User;
}

export interface MfaChallengeResponse {
  mfa_required: boolean;
  challenge_token: string;
  allowed_methods: string[];
}

export interface MfaVerifyResponse {
  access_token: string;
  refresh_token: string;
  id_token?: string;
  session_id?: string;
  expires_in: number;
  token_type: string;
  user: User;
}

interface AuthState {
  currentUser: User | null;
  loading: boolean;
  error: string;
  // MFA state
  mfaRequired: boolean;
  mfaChallengeToken: string;
  mfaAllowedMethods: string[];
}

const initialState: AuthState = {
  currentUser: null,
  loading: false,
  error: '',
  mfaRequired: false,
  mfaChallengeToken: '',
  mfaAllowedMethods: [],
};

export const AuthStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed((state) => ({
    isAuthenticated: computed(() => !!state.currentUser()),
    hasMfaChallenge: computed(() => state.mfaRequired() && !!state.mfaChallengeToken()),
  })),
  withMethods((store) => {
    const http = inject(HttpClient);
    const router = inject(Router);
    const baseUrl = environment.identityServiceUrl;

    /**
     * After successful authentication, redirect to the return_to URL if present
     * (e.g. sso-service sent user here during an OAuth2 flow for admin-console).
     * The sso_session cookie (set by identity-service) handles cross-app auth —
     * no tokens are passed in the URL.
     *
     * Phase 5: if the user holds >1 membership, divert to /select-tenant
     * first so they can pick which workspace to land in. The picker then
     * redirects onwards using the original return_to. Single-membership
     * users skip the detour entirely. On memberships API failure we
     * fall through to the old behavior — ReBAC / multi-tenant UX is
     * best-effort; it should never block a successful login.
     */
    async function redirectAfterAuth(): Promise<void> {
      const params = new URLSearchParams(window.location.search);
      const returnTo = params.get('return_to') || params.get('returnUrl') || '';

      try {
        const resp = await firstValueFrom(
          http.get<{
            memberships: Array<{ tenant_id: string }>;
            active_tenant_id: string;
          }>(`${baseUrl}/auth/session/memberships`, { withCredentials: true }),
        );
        if (resp.memberships.length > 1) {
          const qp = returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : '';
          window.location.href = `/select-tenant${qp}`;
          return;
        }
      } catch {
        // Non-fatal; fall through to the legacy redirect.
      }

      if (returnTo) {
        window.location.href = returnTo;
        return;
      }
      // No return_to in the URL — happens on direct /login visits, bookmarks,
      // or old email links. Navigating to '/' here would bounce back to /login
      // (per app.routes.ts: '' redirectTo 'login'), leaving a signed-in user
      // staring at the sign-in form. Send them to the configured default app.
      if (environment.defaultPostLoginUrl) {
        window.location.href = environment.defaultPostLoginUrl;
        return;
      }
      router.navigateByUrl('/');
    }

    return {
      async login(email: string, password: string, tenantId?: string): Promise<void> {
        patchState(store, { loading: true, error: '' });
        // When the email-step's /auth/public/discover identified an org tenant,
        // we MUST forward that tenant id — otherwise the global tenant
        // interceptor falls back to environment.tenantId (the dev default) and
        // the backend rejects with "no membership in this tenant".
        const resolvedTenant = tenantId || environment.tenantId;
        const headers = new HttpHeaders({ 'X-Tenant-ID': resolvedTenant });
        try {
          const response = await firstValueFrom(
            http.post<AuthResponse | MfaChallengeResponse>(
              `${baseUrl}/auth/login`,
              { email, password },
              { headers },
            ),
          );

          // Check if MFA is required
          if ('mfa_required' in response && (response as MfaChallengeResponse).mfa_required) {
            const mfaResp = response as MfaChallengeResponse;
            patchState(store, {
              loading: false,
              mfaRequired: true,
              mfaChallengeToken: mfaResp.challenge_token,
              mfaAllowedMethods: mfaResp.allowed_methods,
            });
            sessionStorage.setItem('tenantId', resolvedTenant);
            router.navigateByUrl('/mfa/challenge');
            return;
          }

          // Normal login — issue tokens
          const authResp = response as AuthResponse;
          sessionStorage.setItem('accessToken', authResp.access_token);
          sessionStorage.setItem('refreshToken', authResp.refresh_token);
          sessionStorage.setItem('tenantId', resolvedTenant);
          if (authResp.id_token) {
            sessionStorage.setItem('idToken', authResp.id_token);
          }
          patchState(store, { currentUser: authResp.user, loading: false });
          await redirectAfterAuth();
        } catch (err: unknown) {
          const message =
            (err as { error?: { error?: string; message?: string } })?.error?.message ||
            (err as { error?: { error?: string } })?.error?.error ||
            'Login failed. Please try again.';
          patchState(store, { loading: false, error: message });
        }
      },

      async verifyMfa(code: string): Promise<void> {
        patchState(store, { loading: true, error: '' });
        // The MFA challenge token is bound to the tenant that was used during
        // /auth/login; reuse the same X-Tenant-ID we persisted there so the
        // backend's membership lookup hits the right tenant.
        const resolvedTenant = sessionStorage.getItem('tenantId') || environment.tenantId;
        const headers = new HttpHeaders({ 'X-Tenant-ID': resolvedTenant });
        try {
          const response = await firstValueFrom(
            http.post<MfaVerifyResponse>(
              `${baseUrl}/auth/mfa/verify`,
              {
                code,
                challenge_token: store.mfaChallengeToken(),
              },
              { headers },
            ),
          );

          sessionStorage.setItem('accessToken', response.access_token);
          sessionStorage.setItem('refreshToken', response.refresh_token);
          sessionStorage.setItem('tenantId', resolvedTenant);
          if (response.id_token) {
            sessionStorage.setItem('idToken', response.id_token);
          }
          patchState(store, {
            currentUser: response.user,
            loading: false,
            mfaRequired: false,
            mfaChallengeToken: '',
            mfaAllowedMethods: [],
          });
          await redirectAfterAuth();
        } catch (err: unknown) {
          const message =
            (err as { error?: { error?: string } })?.error?.error ||
            'Verification failed. Please try again.';
          patchState(store, { loading: false, error: message });
        }
      },

      async verifyBackupCode(code: string): Promise<void> {
        patchState(store, { loading: true, error: '' });
        const resolvedTenant = sessionStorage.getItem('tenantId') || environment.tenantId;
        const headers = new HttpHeaders({ 'X-Tenant-ID': resolvedTenant });
        try {
          const response = await firstValueFrom(
            http.post<MfaVerifyResponse>(
              `${baseUrl}/auth/mfa/verify`,
              {
                code,
                challenge_token: store.mfaChallengeToken(),
                method: 'backup_code',
              },
              { headers },
            ),
          );

          sessionStorage.setItem('accessToken', response.access_token);
          sessionStorage.setItem('refreshToken', response.refresh_token);
          sessionStorage.setItem('tenantId', resolvedTenant);
          if (response.id_token) {
            sessionStorage.setItem('idToken', response.id_token);
          }
          patchState(store, {
            currentUser: response.user,
            loading: false,
            mfaRequired: false,
            mfaChallengeToken: '',
            mfaAllowedMethods: [],
          });
          await redirectAfterAuth();
        } catch (err: unknown) {
          const message =
            (err as { error?: { error?: string } })?.error?.error ||
            'Backup code invalid. Please try again.';
          patchState(store, { loading: false, error: message });
        }
      },

      async register(
        email: string,
        password: string,
        displayName: string,
      ): Promise<void> {
        patchState(store, { loading: true, error: '' });
        try {
          await firstValueFrom(
            http.post<AuthResponse>(`${baseUrl}/auth/register`, {
              email,
              password,
              display_name: displayName,
            }),
          );
          patchState(store, { loading: false });
          router.navigate(['/login'], {
            queryParams: { registered: 'true' },
          });
        } catch (err: unknown) {
          const message =
            (err as { error?: { error?: string } })?.error?.error ||
            'Registration failed. Please try again.';
          patchState(store, { loading: false, error: message });
        }
      },

      /**
       * Tenantless consumer signup (Phase 1). Hits /auth/public/signup on
       * identity-service, which atomically creates a personal tenant + user +
       * owner membership + session, sets the sso_session cookie, and emails a
       * verification link. The returned user's status is 'pending_verification'
       * until the link is clicked.
       *
       * Note: the session cookie means the user is effectively "signed in" even
       * before verification — we redirect them straight to the post-auth
       * landing page with a "please verify your email" banner hint in the URL.
       */
      async signup(
        emailValue: string,
        password: string,
        displayName: string,
      ): Promise<void> {
        patchState(store, { loading: true, error: '' });
        try {
          const resp = await firstValueFrom(
            http.post<{
              user: { id: string; email: string; display_name: string; status: string };
              tenant: { id: string; slug: string; name: string; tenant_kind: string };
              session_id: string;
            }>(
              `${baseUrl}/auth/public/signup`,
              { email: emailValue, password, display_name: displayName },
              { withCredentials: true },
            ),
          );
          patchState(store, {
            currentUser: {
              id: resp.user.id,
              email: resp.user.email,
              display_name: resp.user.display_name,
            },
            loading: false,
          });
          // Send them to the portal landing with a "verify your email" hint;
          // actual dashboards are external apps that rely on sso_session.
          router.navigate(['/verify-email'], {
            queryParams: { pending: '1', email: emailValue },
          });
        } catch (err: unknown) {
          const status = (err as { status?: number })?.status;
          let message =
            (err as { error?: { error?: string; message?: string } })?.error?.error ||
            'Signup failed. Please try again.';
          if (status === 409) {
            message =
              (err as { error?: { error?: string; message?: string } })?.error?.message ||
              'This email is already registered — try signing in instead.';
          }
          patchState(store, { loading: false, error: message });
        }
      },

      /** Submit the raw token from the /verify-email?token=… URL. */
      async verifyEmail(token: string): Promise<boolean> {
        patchState(store, { loading: true, error: '' });
        try {
          await firstValueFrom(
            http.post(`${baseUrl}/auth/public/verify-email`, { token }),
          );
          patchState(store, { loading: false });
          return true;
        } catch (err: unknown) {
          const message =
            (err as { error?: { message?: string } })?.error?.message ||
            'This verification link is invalid or has expired.';
          patchState(store, { loading: false, error: message });
          return false;
        }
      },

      /**
       * Org signup (Phase 2). Creates an organization tenant + admin user +
       * pending DNS domain claim, sets sso_session cookie. The response carries
       * the TXT record the admin must publish; the caller routes to the
       * /signup-org/verify-domain page to display it.
       *
       * Response shape (backend):
       *   { user, tenant, session_id, domain: {id, domain, status, expires_at},
       *     dns_instructions: {host, type, value, nonce} }
       */
      async signupOrg(payload: {
        org_name: string;
        org_slug: string;
        domain: string;
        email: string;
        password: string;
        full_name: string;
      }): Promise<{
        domainId: string;
        domain: string;
        host: string;
        value: string;
        nonce: string;
        tenantId: string;
      } | null> {
        patchState(store, { loading: true, error: '' });
        try {
          const resp = await firstValueFrom(
            http.post<{
              user: { id: string; email: string; display_name: string; status: string };
              tenant: { id: string; slug: string; name: string; tenant_kind: string };
              session_id: string;
              domain: { id: string; domain: string; status: string; expires_at: string };
              dns_instructions: { host: string; type: string; value: string; nonce: string };
            }>(`${baseUrl}/auth/public/signup-org`, payload, { withCredentials: true }),
          );
          patchState(store, {
            currentUser: {
              id: resp.user.id,
              email: resp.user.email,
              display_name: resp.user.display_name,
            },
            loading: false,
          });
          return {
            domainId: resp.domain.id,
            domain: resp.domain.domain,
            host: resp.dns_instructions.host,
            value: resp.dns_instructions.value,
            nonce: resp.dns_instructions.nonce,
            tenantId: resp.tenant.id,
          };
        } catch (err: unknown) {
          const errObj = (err as { error?: { error?: string; message?: string; field?: string } })?.error;
          const status = (err as { status?: number })?.status;
          let message = errObj?.message || errObj?.error || 'Org signup failed. Please try again.';
          if (status === 409 && errObj?.error === 'domain_already_claimed') {
            message = 'This domain is already verified by another workspace.';
          } else if (status === 409 && errObj?.error === 'slug already taken') {
            message = 'That workspace URL is already taken — pick a different slug.';
          }
          patchState(store, { loading: false, error: message });
          return null;
        }
      },

      /**
       * On-demand domain verification (the "Verify now" button on the TXT
       * instructions page). Hits the authenticated endpoint; relies on the
       * sso_session cookie already set by signupOrg.
       */
      async verifyDomain(tenantId: string, domainId: string): Promise<string> {
        patchState(store, { loading: true, error: '' });
        try {
          const resp = await firstValueFrom(
            http.post<{ outcome: string }>(
              `${baseUrl}/tenants/${tenantId}/domains/${domainId}/verify`,
              {},
              { withCredentials: true },
            ),
          );
          patchState(store, { loading: false });
          return resp.outcome;
        } catch (err: unknown) {
          const message =
            (err as { error?: { message?: string; error?: string } })?.error?.message ||
            (err as { error?: { error?: string } })?.error?.error ||
            'Verification check failed. Try again in a minute.';
          patchState(store, { loading: false, error: message });
          return 'error';
        }
      },

      /**
       * Phase 5: list every tenant the current session holds a membership
       * in. Powers the /select-tenant picker. Returns null on any failure
       * (network / 401 / etc.) so callers can fall back to a single-tenant
       * flow without surfacing opaque errors.
       */
      async getMemberships(): Promise<{
        memberships: Array<{
          tenant_id: string;
          tenant_slug: string;
          tenant_name: string;
          tenant_kind: string;
          role: string;
          is_active: boolean;
        }>;
        active_tenant_id: string;
      } | null> {
        try {
          return await firstValueFrom(
            http.get<{
              memberships: Array<{
                tenant_id: string;
                tenant_slug: string;
                tenant_name: string;
                tenant_kind: string;
                role: string;
                is_active: boolean;
              }>;
              active_tenant_id: string;
            }>(`${baseUrl}/auth/session/memberships`, {
              withCredentials: true,
            }),
          );
        } catch {
          return null;
        }
      },

      /**
       * Phase 5: switch the session's active tenant + rotate tokens.
       *
       * Two-step flow:
       *  1. PATCH /auth/session/active-tenant — flips sessions.active_tenant_id.
       *  2. POST /auth/session/rotate — revokes the prior family and mints
       *     a fresh token set for the new tenant. Without step 2 the user
       *     keeps a stale-tenant access token for up to 15 min (its TTL),
       *     which can leak old-tenant data into UIs that don't check
       *     session-vs-token staleness.
       *
       * Step 2 failing doesn't fail the whole flow — the user is still
       * switched per sessions.active_tenant_id, just without immediate
       * token rotation. The natural /oauth2/token call at the next refresh
       * cycle will bring tokens in line.
       *
       * Returns the new active tenant_id on success, null on failure.
       */
      async switchActiveTenant(tenantId: string): Promise<string | null> {
        patchState(store, { loading: true, error: '' });
        try {
          const resp = await firstValueFrom(
            http.patch<{ active_tenant_id: string }>(
              `${baseUrl}/auth/session/active-tenant`,
              { tenant_id: tenantId },
              { withCredentials: true },
            ),
          );
          sessionStorage.setItem('tenantId', resp.active_tenant_id);

          // Best-effort token rotation. Soft-fail: a 5xx here shouldn't
          // block the user from navigating; the stored tenantId is already
          // updated and the next /oauth2/token call will rotate naturally.
          try {
            const rotated = await firstValueFrom(
              http.post<{
                access_token: string;
                refresh_token: string;
                id_token?: string;
                expires_in: number;
                token_type: string;
              }>(`${baseUrl}/auth/session/rotate`, {}, { withCredentials: true }),
            );
            sessionStorage.setItem('accessToken', rotated.access_token);
            sessionStorage.setItem('refreshToken', rotated.refresh_token);
            if (rotated.id_token) {
              sessionStorage.setItem('idToken', rotated.id_token);
            }
          } catch {
            // Swallow — rotation is a staleness mitigation, not a
            // correctness requirement. The backend already flipped
            // active_tenant_id.
          }

          patchState(store, { loading: false });
          return resp.active_tenant_id;
        } catch (err: unknown) {
          const message =
            (err as { error?: { message?: string } })?.error?.message ||
            'We couldn\'t switch tenants. Please try again.';
          patchState(store, { loading: false, error: message });
          return null;
        }
      },

      /**
       * Phase 4 post-claim migration. Fetches the offer metadata for a token
       * so /migration/:token can render "join <domain> or keep your personal
       * workspace". Returns null on any error — the server collapses 410/400/
       * 404 into a single "unavailable" response for enumeration resistance.
       */
      async migrationLookup(token: string): Promise<{
        id: string;
        domain: string;
        organization: string;
        status: string;
        expires_at: string;
        offered_at: string;
      } | null> {
        try {
          return await firstValueFrom(
            http.get<{
              id: string;
              domain: string;
              organization: string;
              status: string;
              expires_at: string;
              offered_at: string;
            }>(`${baseUrl}/auth/public/migration/${encodeURIComponent(token)}`),
          );
        } catch {
          return null;
        }
      },

      /**
       * Accept the migration offer. On success the server moves the user's
       * membership to the org, soft-deletes the personal tenant, and revokes
       * all active sessions — so any stale sso_session cookie in this browser
       * becomes invalid. Returns true on 204.
       */
      async migrationAccept(token: string): Promise<boolean> {
        patchState(store, { loading: true, error: '' });
        try {
          await firstValueFrom(
            http.post(
              `${baseUrl}/auth/public/migration/${encodeURIComponent(token)}/accept`,
              {},
            ),
          );
          // Server revoked all active sessions for this user; the sso_session
          // cookie is now dead. Clear local auth material too so nothing in
          // this tab reads a stale token on the way to /login.
          sessionStorage.removeItem('accessToken');
          sessionStorage.removeItem('refreshToken');
          sessionStorage.removeItem('idToken');
          sessionStorage.removeItem('tenantId');
          patchState(store, { loading: false, currentUser: null });
          return true;
        } catch (err: unknown) {
          const status = (err as { status?: number })?.status;
          const message =
            status === 410
              ? 'This migration link is no longer valid.'
              : (err as { error?: { message?: string } })?.error?.message ||
                'We couldn\'t accept this migration. Please try again.';
          patchState(store, { loading: false, error: message });
          return false;
        }
      },

      /** Decline the migration offer; user keeps their personal workspace. */
      async migrationDecline(token: string): Promise<boolean> {
        patchState(store, { loading: true, error: '' });
        try {
          await firstValueFrom(
            http.post(
              `${baseUrl}/auth/public/migration/${encodeURIComponent(token)}/decline`,
              {},
            ),
          );
          patchState(store, { loading: false });
          return true;
        } catch (err: unknown) {
          const status = (err as { status?: number })?.status;
          const message =
            status === 410
              ? 'This migration link is no longer valid.'
              : (err as { error?: { message?: string } })?.error?.message ||
                'We couldn\'t record your response. Please try again.';
          patchState(store, { loading: false, error: message });
          return false;
        }
      },

      /** Ask backend to re-issue a verification email. Always succeeds visibly. */
      async resendVerification(emailValue: string): Promise<void> {
        patchState(store, { loading: true, error: '' });
        try {
          await firstValueFrom(
            http.post(`${baseUrl}/auth/public/verify-email/resend`, {
              email: emailValue,
            }),
          );
        } catch {
          // Resend is enumeration-resistant server-side; swallow errors and
          // show the same confirmation UX as success.
        }
        patchState(store, { loading: false });
      },

      logout(): void {
        sessionStorage.removeItem('accessToken');
        sessionStorage.removeItem('refreshToken');
        patchState(store, {
          currentUser: null,
          error: '',
          mfaRequired: false,
          mfaChallengeToken: '',
          mfaAllowedMethods: [],
        });
        router.navigateByUrl('/login');
      },

      clearError(): void {
        patchState(store, { error: '' });
      },

      clearMfaState(): void {
        patchState(store, {
          mfaRequired: false,
          mfaChallengeToken: '',
          mfaAllowedMethods: [],
        });
      },

      getAccessToken(): string | null {
        return sessionStorage.getItem('accessToken');
      },
    };
  }),
);
