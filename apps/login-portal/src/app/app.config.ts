import { ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors, HttpInterceptorFn } from '@angular/common/http';
import { appRoutes } from './app.routes';
import { environment } from '../environments/environment';

/**
 * Attaches X-Tenant-ID header to all requests.
 */
const tenantInterceptor: HttpInterceptorFn = (req, next) => {
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
