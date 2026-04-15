import { HttpInterceptorFn } from '@angular/common/http';

export const tenantInterceptor: HttpInterceptorFn = (req, next) => {
  const tenantId = sessionStorage.getItem('tenantId');
  if (tenantId) {
    const cloned = req.clone({
      setHeaders: { 'X-Tenant-ID': tenantId },
    });
    return next(cloned);
  }
  return next(req);
};
