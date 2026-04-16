import { ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
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

const bearerInterceptor: HttpInterceptorFn = (req, next) => {
  const token = sessionStorage.getItem('accessToken');
  if (token) {
    return next(
      req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }),
    );
  }
  return next(req);
};

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
