// Guards
export { PasetoGuard, type AuthUser } from './paseto.guard.js';
export { RebacGuard } from './rebac.guard.js';
export {
  SessionCookieGuard,
  SESSION_DB_CLIENT,
  type SessionDbClient,
  type AuthSession,
} from './session-cookie.guard.js';
export {
  PlatformAdminGuard,
  AllowPlatformRole,
  PLATFORM_ROLE_KEY,
  type PlatformAdminRole,
} from './platform-admin.guard.js';

// Decorators
export { CurrentUser } from './decorators/current-user.decorator.js';
export { TenantId } from './decorators/tenant-id.decorator.js';
export {
  RequirePermission,
  PERMISSION_KEY,
  type PermissionMetadata,
} from './decorators/require-permission.decorator.js';

// Capabilities (ADR-0002): single source of truth for role → capability
// derivation. Both NestJS APIs import `computeCapabilities`; the new
// `RequireCapabilityGuard` consumes the resulting list off `request.user`.
export { computeCapabilities } from './capabilities.js';
export {
  RequireCapability,
  RequireCapabilityGuard,
  REQUIRE_CAPABILITY_KEY,
} from './require-capability.guard.js';

// E2E review A1 — gate write-shaped endpoints on email_verified. Composes
// with `@RequireCapability`; the verification check is independent of
// capability (a verified owner with `manage_api_keys` passes both; an
// unverified owner with `manage_api_keys` passes the capability check
// but fails the verified-email check with a stable `email_not_verified`
// code consoles can render against).
export {
  RequireVerifiedEmail,
  RequireVerifiedEmailGuard,
  REQUIRE_VERIFIED_EMAIL_KEY,
} from './require-verified-email.guard.js';

// Module
export { AuthzModule } from './authz.module.js';
