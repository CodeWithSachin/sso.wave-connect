import { computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
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
     * After successful authentication, redirect to the returnUrl if present
     * (e.g. admin-console sent user here), otherwise navigate to '/'.
     */
    /**
     * After successful authentication, redirect to the returnUrl if present
     * (e.g. admin-console sent user here). Passes tokens via URL hash fragment
     * since sessionStorage is per-origin and won't be accessible cross-port.
     */
    function redirectAfterAuth(): void {
      const params = new URLSearchParams(window.location.search);
      const returnUrl = params.get('returnUrl');
      if (returnUrl) {
        const accessToken = sessionStorage.getItem('accessToken') ?? '';
        const refreshToken = sessionStorage.getItem('refreshToken') ?? '';
        const idToken = sessionStorage.getItem('idToken') ?? '';
        const tenantId = sessionStorage.getItem('tenantId') ?? '';
        const hash = new URLSearchParams({
          access_token: accessToken,
          refresh_token: refreshToken,
          id_token: idToken,
          tenant_id: tenantId,
        }).toString();
        window.location.href = `${returnUrl}#${hash}`;
      } else {
        router.navigateByUrl('/');
      }
    }

    return {
      async login(email: string, password: string): Promise<void> {
        patchState(store, { loading: true, error: '' });
        try {
          const response = await firstValueFrom(
            http.post<AuthResponse | MfaChallengeResponse>(
              `${baseUrl}/auth/login`,
              { email, password },
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
            router.navigateByUrl('/mfa/challenge');
            return;
          }

          // Normal login — issue tokens
          const authResp = response as AuthResponse;
          sessionStorage.setItem('accessToken', authResp.access_token);
          sessionStorage.setItem('refreshToken', authResp.refresh_token);
          sessionStorage.setItem('tenantId', environment.tenantId);
          if (authResp.id_token) {
            sessionStorage.setItem('idToken', authResp.id_token);
          }
          patchState(store, { currentUser: authResp.user, loading: false });
          redirectAfterAuth();
        } catch (err: unknown) {
          const message =
            (err as { error?: { error?: string } })?.error?.error ||
            'Login failed. Please try again.';
          patchState(store, { loading: false, error: message });
        }
      },

      async verifyMfa(code: string): Promise<void> {
        patchState(store, { loading: true, error: '' });
        try {
          const response = await firstValueFrom(
            http.post<MfaVerifyResponse>(`${baseUrl}/auth/mfa/verify`, {
              code,
              challenge_token: store.mfaChallengeToken(),
            }),
          );

          sessionStorage.setItem('accessToken', response.access_token);
          sessionStorage.setItem('refreshToken', response.refresh_token);
          sessionStorage.setItem('tenantId', environment.tenantId);
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
          redirectAfterAuth();
        } catch (err: unknown) {
          const message =
            (err as { error?: { error?: string } })?.error?.error ||
            'Verification failed. Please try again.';
          patchState(store, { loading: false, error: message });
        }
      },

      async verifyBackupCode(code: string): Promise<void> {
        patchState(store, { loading: true, error: '' });
        try {
          const response = await firstValueFrom(
            http.post<MfaVerifyResponse>(`${baseUrl}/auth/mfa/verify`, {
              code,
              challenge_token: store.mfaChallengeToken(),
              method: 'backup_code',
            }),
          );

          sessionStorage.setItem('accessToken', response.access_token);
          sessionStorage.setItem('refreshToken', response.refresh_token);
          sessionStorage.setItem('tenantId', environment.tenantId);
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
          redirectAfterAuth();
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
