import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  PERMISSION_KEY,
  type PermissionMetadata,
} from './decorators/require-permission.decorator.js';
import type { AuthUser } from './paseto.guard.js';

@Injectable()
export class RebacGuard implements CanActivate {
  private readonly logger = new Logger(RebacGuard.name);

  constructor(private readonly reflector: Reflector) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const permission = this.reflector.getAllAndOverride<
      PermissionMetadata | undefined
    >(PERMISSION_KEY, [ctx.getHandler(), ctx.getClass()]);

    if (!permission) {
      // No @RequirePermission decorator -- allow through
      return true;
    }

    const request = ctx.switchToHttp().getRequest();
    const user = request['user'] as AuthUser | undefined;

    if (!user) {
      throw new UnauthorizedException(
        'User not authenticated. Ensure PasetoGuard runs before RebacGuard.'
      );
    }

    const objectParam = permission.objectParam ?? 'id';
    const objectId = request.params?.[objectParam];

    if (!objectId) {
      throw new ForbiddenException(
        `Missing route parameter "${objectParam}" required for authorization`
      );
    }

    const authzServiceUrl = process.env['AUTHZ_SERVICE_URL'];
    if (!authzServiceUrl) {
      this.logger.error('AUTHZ_SERVICE_URL environment variable is not set');
      throw new ForbiddenException('Authorization service unavailable');
    }

    const checkUrl = `${authzServiceUrl.replace(/\/+$/, '')}/authz/check`;

    const body = {
      user: `user:${user.id}`,
      relation: permission.relation,
      object: `${permission.objectType}:${objectId}`,
    };

    try {
      const response = await fetch(checkUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        this.logger.error(
          `Authz service returned status ${response.status}: ${response.statusText}`
        );
        throw new ForbiddenException('Authorization check failed');
      }

      const result = (await response.json()) as { allowed: boolean };

      if (!result.allowed) {
        throw new ForbiddenException(
          `Permission denied: ${permission.relation} on ${permission.objectType}:${objectId}`
        );
      }

      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      this.logger.error(
        `Failed to reach authz service: ${(error as Error).message}`
      );
      throw new ForbiddenException('Authorization service unavailable');
    }
  }
}
