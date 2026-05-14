import { ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors, HttpInterceptorFn } from '@angular/common/http';
import { appRoutes } from './app.routes';
import { environment } from '../environments/environment';

/**
 * Attaches the default X-Tenant-ID header. If the caller has already set the
 * header on the request (e.g. AuthStore.login forwarding the tenant resolved
 * by /auth/public/discover), we leave it alone — otherwise the per-call value
 * would be silently overwritten with the dev default.
 */
const tenantInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.headers.has('X-Tenant-ID')) {
    return next(req);
  }
  const cloned = req.clone({
    setHeaders: { 'X-Tenant-ID': environment.tenantId },
  });
  return next(cloned);
};

/**
 * Sets withCredentials: true for identity-service requests so the browser
 * accepts the sso_session Set-Cookie from cross-origin responses.
 */
const credentialsInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.url.startsWith(environment.identityServiceUrl)) {
    return next(req.clone({ withCredentials: true }));
  }
  return next(req);
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(appRoutes),
    provideHttpClient(withInterceptors([credentialsInterceptor, tenantInterceptor])),
  ],
};
