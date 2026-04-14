import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';

/**
 * Functional route guard that checks for an access token in sessionStorage.
 *
 * Usage with Angular router:
 * ```ts
 * {
 *   path: 'dashboard',
 *   canActivate: [authGuard],
 *   component: DashboardComponent,
 * }
 * ```
 *
 * If no token is present, the user is redirected to `/login` with a
 * `returnUrl` query parameter so they can be sent back after authentication.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const router = inject(Router);
  const accessToken = sessionStorage.getItem('accessToken');

  if (accessToken) {
    return true;
  }

  return router.createUrlTree(['/login'], {
    queryParams: { returnUrl: state.url },
  });
};
