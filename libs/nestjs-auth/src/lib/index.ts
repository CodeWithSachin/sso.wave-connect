// Guards
export { PasetoGuard, type AuthUser } from './paseto.guard.js';
export { RebacGuard } from './rebac.guard.js';

// Decorators
export { CurrentUser } from './decorators/current-user.decorator.js';
export { TenantId } from './decorators/tenant-id.decorator.js';
export {
  RequirePermission,
  PERMISSION_KEY,
  type PermissionMetadata,
} from './decorators/require-permission.decorator.js';

// Module
export { AuthzModule } from './authz.module.js';
