import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import {
  provideHttpClient,
  withInterceptors,
  HttpErrorResponse,
} from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { MessageService } from 'primeng/api';
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
  heroEnvelope,
  heroArrowsRightLeft,
  heroChevronUpDown,
  heroLockClosed,
  heroComputerDesktop,
} from '@ng-icons/heroicons/outline';
import { appRoutes } from './app.routes';
import { HttpInterceptorFn } from '@angular/common/http';
import { snowPassThrough } from '../../../../libs/ui-components/src/lib/primeng-passthrough';
import { environment } from './environments/environment';
import { SessionStore } from './core/session/session.store';

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
//
// `/session/me` is intentionally exempt: SessionStore.hydrate() expects a 401
// for unauthenticated visitors and turns it into a `hydrated:true,
// error:'...'` state. Without the exemption, an anonymous user landing on
// any route triggers an instant redirect-storm (route guard → sso-service,
// hydrate → interceptor → login-portal), with login-portal usually losing
// the race and leaving the user mid-bounce. A8 fix.
const unauthorizedInterceptor: HttpInterceptorFn = (req, next) => {
  // MessageService is lazily injected because the interceptor runs before
  // LayoutComponent mounts on the first paint of a deep link; if it isn't
  // available yet, the toast falls through silently.
  const messages = inject(MessageService, { optional: true });
  return next(req).pipe(
    catchError((err: unknown) => {
      if (
        err instanceof HttpErrorResponse &&
        err.status === 401 &&
        !req.url.includes('/api/v1/session/me')
      ) {
        sessionStorage.clear();
        if (!window.location.pathname.startsWith('/callback')) {
          window.location.href = environment.loginPortalUrl;
        }
      }
      // A1: surface verify-email 403s as a toast so the user knows WHY the
      // action failed. The matching is intentionally string-based — `code`
      // can live on either `err.error.message` (NestJS envelope) or
      // `err.error.error` (identity-service envelope). Both are checked.
      if (err instanceof HttpErrorResponse && err.status === 403) {
        const body = err.error as
          | { error?: string; message?: string; detail?: string }
          | undefined;
        const code = body?.message ?? body?.error;
        if (code === 'email_not_verified') {
          messages?.add({
            severity: 'warn',
            summary: 'Email not verified',
            detail:
              body?.detail ??
              'Verify your email to unlock this action — check your inbox.',
            life: 5000,
          });
        }
      }
      return throwError(() => err);
    }),
  );
};

export const appConfig: ApplicationConfig = {
  providers: [
    // PrimeNG MessageService at the root so both the http interceptor
    // (A1 email_not_verified toast) AND the layout's <p-toast/> consume
    // the same instance. Without this it would be component-scoped to
    // LayoutComponent and the interceptor's inject() would return null.
    MessageService,
    provideZonelessChangeDetection(),
    provideRouter(appRoutes),
    provideHttpClient(
      withInterceptors([credentialsInterceptor, unauthorizedInterceptor]),
    ),
    /**
     * Hydrate SessionStore before any route resolves. `hydrate()` races a 3s
     * deadline so a slow or down admin-api doesn't block the shell from
     * rendering — on timeout the capability guard redirects any protected
     * route to /dashboard (the cap-less fallback). The returned promise is
     * what Angular awaits before bootstrap completes.
     *
     * `APP_INITIALIZER` was deprecated in Angular 19 and removed in 20;
     * `provideAppInitializer` is the supported replacement.
     */
    provideAppInitializer(() => inject(SessionStore).hydrate()),
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
      heroEnvelope,
      heroArrowsRightLeft,
      heroChevronUpDown,
      heroLockClosed,
      heroComputerDesktop,
    }),
    provideNgIconsConfig({ size: '1.25rem' }),
  ],
};
