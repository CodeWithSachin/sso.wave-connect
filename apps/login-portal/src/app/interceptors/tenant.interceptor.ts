import { HttpInterceptorFn } from '@angular/common/http';
import { environment } from '../../environments/environment';

export const tenantInterceptor: HttpInterceptorFn = (req, next) => {
  const cloned = req.clone({
    setHeaders: {
      'X-Tenant-ID': environment.tenantId,
    },
  });
  return next(cloned);
};
