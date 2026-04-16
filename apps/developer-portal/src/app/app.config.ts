import { ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors, HttpInterceptorFn } from '@angular/common/http';
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
} from '@ng-icons/heroicons/outline';
import { appRoutes } from './app.routes';
import { snowPassThrough } from '../../../../libs/ui-components/src/lib/primeng-passthrough';

const bearerInterceptor: HttpInterceptorFn = (req, next) => {
  const token = sessionStorage.getItem('accessToken');
  if (token) {
    return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
  }
  return next(req);
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(appRoutes),
    provideHttpClient(withInterceptors([bearerInterceptor])),
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
    }),
    provideNgIconsConfig({ size: '1.25rem' }),
  ],
};
