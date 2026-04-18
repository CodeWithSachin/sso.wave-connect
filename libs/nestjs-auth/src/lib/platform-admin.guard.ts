import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  Optional,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { SESSION_DB_CLIENT, type SessionDbClient } from './session-cookie.guard.js';

/**
 * Metadata key set by the `@AllowPlatformRole()` decorator. Controllers/handlers
 * can restrict themselves to a subset of platform-admin roles. Default: any
 * non-revoked platform_admins row passes.
 */
export const PLATFORM_ROLE_KEY = 'platform_admin_required_role';

export type PlatformAdminRole = 'superadmin' | 'support' | 'readonly';

/**
 * Decorator: restrict a handler (or whole controller) to specific platform-admin
 * roles. When absent, any active platform admin passes.
 *
 * @example
 *   @UseGuards(PlatformAdminGuard)
 *   @AllowPlatformRole('superadmin')
 *   @Delete(':id')
 *   destroy(...) {}
 */
export const AllowPlatformRole = (...roles: PlatformAdminRole[]) =>
  SetMetadata(PLATFORM_ROLE_KEY, roles);

interface PlatformAdminRow {
  role: PlatformAdminRole;
}

interface RequestUserShape {
  id: string;
}

/**
 * Gates endpoints on membership in the `platform_admins` table (migration 000018).
 *
 * MUST run AFTER `SessionCookieGuard` (which populates `request.user`). Typical
 * wiring applies `SessionCookieGuard` as the app-level `APP_GUARD` and this
 * guard via `@UseGuards(PlatformAdminGuard)` at the controller level — then the
 * execution order is session → platform-admin.
 *
 * Role metadata (`@AllowPlatformRole('superadmin')`) is optional. Without it,
 * any active platform admin passes.
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  private readonly logger = new Logger(PlatformAdminGuard.name);

  constructor(
    private readonly reflector: Reflector,
    @Optional() @Inject(SESSION_DB_CLIENT) private readonly db: SessionDbClient | null,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const request = ctx.switchToHttp().getRequest<{ user?: RequestUserShape }>();
    const user = request.user;

    if (!user?.id) {
      // SessionCookieGuard should have thrown before we got here; fail closed.
      throw new UnauthorizedException('Missing authenticated session');
    }

    if (!this.db) {
      this.logger.error(
        'PlatformAdminGuard is active but SESSION_DB_CLIENT was not provided in the module.',
      );
      throw new ForbiddenException('Platform role check is not configured');
    }

    const rows = await this.db.$queryRaw<PlatformAdminRow[]>`
      SELECT role
      FROM platform_admins
      WHERE user_id = ${user.id}::uuid
        AND revoked_at IS NULL
      LIMIT 1
    `;

    if (!rows || rows.length === 0) {
      this.logger.warn(
        `Platform-admin check denied: user ${user.id} has no active platform_admins row`,
      );
      throw new ForbiddenException('Platform admin access required');
    }

    const grantedRole = rows[0].role;
    const allowedRoles = this.reflector.getAllAndOverride<PlatformAdminRole[] | undefined>(
      PLATFORM_ROLE_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );

    if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(grantedRole)) {
      this.logger.warn(
        `Platform-admin role mismatch: user ${user.id} has ${grantedRole}, endpoint requires ${allowedRoles.join('|')}`,
      );
      throw new ForbiddenException(
        `Platform role '${grantedRole}' insufficient; required one of: ${allowedRoles.join(', ')}`,
      );
    }

    // Decorate the request for downstream handlers that want to branch on role.
    (request as unknown as { platformRole: PlatformAdminRole }).platformRole = grantedRole;
    return true;
  }
}
