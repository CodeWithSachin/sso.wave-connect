import { inject } from '@angular/core';
import {
  type HttpInterceptorFn,
  HttpRequest,
  type HttpHandlerFn,
  HttpErrorResponse,
  HttpClient,
} from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';

interface RefreshResponse {
  accessToken: string;
}

/**
 * Determines whether a URL is an external (third-party) resource
 * that should not receive an Authorization header.
 */
function isExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.origin !== window.location.origin;
  } catch {
    // Relative URLs are always internal
    return false;
  }
}

/**
 * Clones the request with the given Bearer token attached.
 */
function addBearerToken(
  req: HttpRequest<unknown>,
  token: string,
): HttpRequest<unknown> {
  return req.clone({
    setHeaders: { Authorization: `Bearer ${token}` },
  });
}

/**
 * Removes stored tokens and navigates to the login page.
 */
function clearTokensAndRedirect(router: Router): void {
  sessionStorage.removeItem('accessToken');
  sessionStorage.removeItem('refreshToken');
  router.navigateByUrl('/login');
}

/**
 * Functional HTTP interceptor that attaches the PASETO access token
 * to outgoing requests and handles 401 token-refresh flows.
 *
 * Usage:
 * ```ts
 * provideHttpClient(withInterceptors([authInterceptor]))
 * ```
 *
 * Behaviour:
 * 1. Reads the access token from `sessionStorage('accessToken')`.
 * 2. Attaches `Authorization: Bearer <token>` to all same-origin requests.
 * 3. On a 401 response, attempts a silent refresh via `POST /oauth2/token`.
 * 4. If refresh succeeds, retries the original request with the new token.
 * 5. If refresh fails, clears stored tokens and redirects to `/login`.
 */
export const authInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
) => {
  // Capture injected services in the interceptor's injection context
  const http = inject(HttpClient);
  const router = inject(Router);

  // Skip external URLs -- never send our tokens to third parties
  if (isExternalUrl(req.url)) {
    return next(req);
  }

  const accessToken = sessionStorage.getItem('accessToken');
  const outgoing = accessToken ? addBearerToken(req, accessToken) : req;

  return next(outgoing).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status !== 401) {
        return throwError(() => error);
      }

      // Don't retry refresh requests to avoid infinite loops
      if (req.url.includes('/oauth2/token')) {
        clearTokensAndRedirect(router);
        return throwError(() => error);
      }

      // Attempt token refresh
      const refreshToken = sessionStorage.getItem('refreshToken');

      if (!refreshToken) {
        clearTokensAndRedirect(router);
        return throwError(() => new Error('No refresh token available'));
      }

      return http
        .post<RefreshResponse>('/oauth2/token', { refreshToken })
        .pipe(
          switchMap((response) => {
            sessionStorage.setItem('accessToken', response.accessToken);
            // Retry the original request with the new token
            return next(addBearerToken(req, response.accessToken));
          }),
          catchError((refreshError) => {
            clearTokensAndRedirect(router);
            return throwError(() => refreshError);
          }),
        );
    }),
  );
};
