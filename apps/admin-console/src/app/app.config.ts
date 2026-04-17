import { ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import {
  provideHttpClient,
  withInterceptors,
  HttpErrorResponse,
} from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { providePrimeNG } from 'primeng/config';
import Nora from '@primeng/themes/nora';
import { provideIcons, provideNgIconsConfig } from '@ng-icons/core';
import {
  heroHome,
  heroUsers,
  heroUserGroup,
  heroShieldCheck,
  heroBolt,
  heroClipboardDocumentList,
  heroArrowPath,
  heroSun,
  heroMoon,
  heroPlus,
  heroUserPlus,
  heroPencilSquare,
  heroTrash,
  heroEllipsisVertical,
  heroMagnifyingGlass,
  heroFunnel,
  heroArrowTrendingUp,
  heroArrowTrendingDown,
  heroChartBar,
  heroKey,
  heroClipboard,
  heroXMark,
  heroCheck,
  heroExclamationTriangle,
  heroInformationCircle,
  heroChevronLeft,
  heroChevronRight,
  heroBars3,
  heroGlobeAlt,
  heroCog6Tooth,
  heroArrowRightStartOnRectangle,
} from '@ng-icons/heroicons/outline';
import { appRoutes } from './app.routes';
import { HttpInterceptorFn } from '@angular/common/http';
import { snowPassThrough } from '../../../../libs/ui-components/src/lib/primeng-passthrough';

// Browser auth uses the sso_session HttpOnly cookie set by identity-service on login.
// This interceptor ensures every cross-origin API call sends that cookie; the backend
// SessionCookieGuard validates it and derives userId/tenantId from the sessions table.
// The bearer + tenant-id interceptors were removed — PASETO access tokens are no longer
// reused per request (see PASETO spec and KT docs).
const credentialsInterceptor: HttpInterceptorFn = (req, next) =>
  next(req.clone({ withCredentials: true }));

// On any 401 from backend APIs, drop local auth state and force the user back
// through the SSO guard. We do a hard navigation so sessionStorage is read fresh
// and the guard re-runs the OAuth2 PKCE redirect when idToken is missing.
const unauthorizedInterceptor: HttpInterceptorFn = (req, next) =>
  next(req).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && err.status === 401) {
        sessionStorage.clear();
        if (!window.location.pathname.startsWith('/callback')) {
          window.location.href = '/';
        }
      }
      return throwError(() => err);
    }),
  );

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(appRoutes),
    provideHttpClient(
      withInterceptors([credentialsInterceptor, unauthorizedInterceptor]),
    ),
    provideAnimationsAsync(),
    providePrimeNG({
      theme: {
        preset: Nora,
        options: {
          darkModeSelector: '.dark',
        },
      },
      ripple: true,
      pt: snowPassThrough,
    }),
    provideIcons({
      heroHome,
      heroUsers,
      heroUserGroup,
      heroShieldCheck,
      heroBolt,
      heroClipboardDocumentList,
      heroArrowPath,
      heroSun,
      heroMoon,
      heroPlus,
      heroUserPlus,
      heroPencilSquare,
      heroTrash,
      heroEllipsisVertical,
      heroMagnifyingGlass,
      heroFunnel,
      heroArrowTrendingUp,
      heroArrowTrendingDown,
      heroChartBar,
      heroKey,
      heroClipboard,
      heroXMark,
      heroCheck,
      heroExclamationTriangle,
      heroInformationCircle,
      heroChevronLeft,
      heroChevronRight,
      heroBars3,
      heroGlobeAlt,
      heroCog6Tooth,
      heroArrowRightStartOnRectangle,
    }),
    provideNgIconsConfig({ size: '1.25rem' }),
  ],
};
