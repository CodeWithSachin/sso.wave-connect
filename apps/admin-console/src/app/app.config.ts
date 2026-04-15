import { ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { appRoutes } from './app.routes';
import { HttpInterceptorFn } from '@angular/common/http';

/**
 * Attaches the PASETO access token as a Bearer header to all same-origin requests.
 * Token is stored by the OAuth2 callback after PKCE exchange.
 */
const bearerInterceptor: HttpInterceptorFn = (req, next) => {
  const token = sessionStorage.getItem('accessToken');
  if (token) {
    return next(
      req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }),
    );
  }
  return next(req);
};

/**
 * Attaches the X-Tenant-ID header from sessionStorage (set during OAuth callback).
 */
const tenantInterceptor: HttpInterceptorFn = (req, next) => {
  const tenantId = sessionStorage.getItem('tenantId');
  if (tenantId) {
    return next(
      req.clone({ setHeaders: { 'X-Tenant-ID': tenantId } }),
    );
  }
  return next(req);
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(appRoutes),
    provideHttpClient(withInterceptors([bearerInterceptor, tenantInterceptor])),
  ],
};
