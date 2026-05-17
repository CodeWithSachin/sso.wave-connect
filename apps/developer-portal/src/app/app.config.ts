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
  HttpInterceptorFn,
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
  heroKey,
  heroFingerPrint,
  heroBookOpen,
  heroArrowPath,
  heroSun,
  heroMoon,
  heroPlus,
  heroPencilSquare,
  heroTrash,
  heroEllipsisVertical,
  heroMagnifyingGlass,
  heroClipboard,
  heroXMark,
  heroCheck,
  heroExclamationTriangle,
  heroInformationCircle,
  heroChevronLeft,
  heroChevronRight,
  heroArrowTrendingUp,
  heroChartBar,
  heroCodeBracket,
  heroDocumentText,
  heroArrowTopRightOnSquare,
  heroArrowRightStartOnRectangle,
  heroBars3,
  heroCog6Tooth,
  heroShieldCheck,
  heroBolt,
  heroBellAlert,
  heroClock,
  heroEye,
  heroPaperAirplane,
  heroUser,
  heroLockClosed,
  heroComputerDesktop,
} from '@ng-icons/heroicons/outline';
import { appRoutes } from './app.routes';
import { snowPassThrough } from '../../../../libs/ui-components/src/lib/primeng-passthrough';
import { SessionStore } from './core/session/session.store';
import { environment } from './environments/environment';

// Browser auth uses the sso_session HttpOnly cookie set by identity-service on login.
// The backend SessionCookieGuard validates it and derives userId/tenantId from the sessions table.
const credentialsInterceptor: HttpInterceptorFn = (req, next) =>
  next(req.clone({ withCredentials: true }));

// On any 401 from backend APIs, drop local auth state and send the user to the
// login-portal. We avoid bouncing through `/` (which re-triggers the auth guard
// → SSO authorize) because a still-valid sso_session cookie would silently
// re-auth and land the user right back on the dashboard — indistinguishable
// from "logout didn't work." The login-portal is the canonical signed-out UI.
//
// `/session/me` is intentionally exempt — SessionStore.hydrate() probes that
// endpoint and expects a 401 for unauthenticated visitors. See admin-console
// app.config.ts for the longer rationale. A8 fix.
const unauthorizedInterceptor: HttpInterceptorFn = (req, next) => {
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
      // A1: surface verify-email 403s — mirrors admin-console exactly.
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
    // PrimeNG MessageService at the root so the http interceptor
    // (A1 email_not_verified toast) AND the layout's <p-toast/> share
    // a single instance — without this the interceptor's inject()
    // returns null.
    MessageService,
    provideZonelessChangeDetection(),
    provideRouter(appRoutes),
    provideHttpClient(
      withInterceptors([credentialsInterceptor, unauthorizedInterceptor]),
    ),
    // Hydrate SessionStore before any route resolves. `hydrate()` races a
    // 3 s deadline; on timeout the shell renders with `capabilities = []`
    // and `requireCapability` guards redirect protected routes to
    // /dashboard. Matches admin-console's bootstrap pattern.
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
      heroKey,
      heroFingerPrint,
      heroBookOpen,
      heroArrowPath,
      heroSun,
      heroMoon,
      heroPlus,
      heroPencilSquare,
      heroTrash,
      heroEllipsisVertical,
      heroMagnifyingGlass,
      heroClipboard,
      heroXMark,
      heroCheck,
      heroExclamationTriangle,
      heroInformationCircle,
      heroChevronLeft,
      heroChevronRight,
      heroArrowTrendingUp,
      heroChartBar,
      heroCodeBracket,
      heroDocumentText,
      heroArrowTopRightOnSquare,
      heroArrowRightStartOnRectangle,
      heroBars3,
      heroCog6Tooth,
      heroShieldCheck,
      heroBolt,
      heroBellAlert,
      heroClock,
      heroEye,
      heroPaperAirplane,
      heroUser,
      heroLockClosed,
      heroComputerDesktop,
    }),
    provideNgIconsConfig({ size: '1.25rem' }),
  ],
};
