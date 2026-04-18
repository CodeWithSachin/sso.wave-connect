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
import { environment } from './environments/environment';

// Browser auth uses the sso_session HttpOnly cookie set by identity-service on login.
// This interceptor ensures every cross-origin API call sends that cookie; the backend
// SessionCookieGuard validates it and derives userId/tenantId from the sessions table.
// The bearer + tenant-id interceptors were removed — PASETO access tokens are no longer
// reused per request (see PASETO spec and KT docs).
const credentialsInterceptor: HttpInterceptorFn = (req, next) =>
  next(req.clone({ withCredentials: true }));

// On any 401 from backend APIs, drop local auth state and send the user to the
// login-portal. We avoid bouncing through `/` (which re-triggers the auth guard
// → SSO authorize) because a still-valid sso_session cookie would silently
// re-auth and land the user right back on the dashboard — indistinguishable
// from "logout didn't work." The login-portal is the canonical signed-out UI.
const unauthorizedInterceptor: HttpInterceptorFn = (req, next) =>
  next(req).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && err.status === 401) {
        sessionStorage.clear();
        if (!window.location.pathname.startsWith('/callback')) {
          window.location.href = environment.loginPortalUrl;
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
