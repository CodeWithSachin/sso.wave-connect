import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { emitGuardAuditEvent } from './guard-audit.js';
import {
  SESSION_DB_CLIENT,
  type SessionDbClient,
} from './session-cookie.guard.js';

/**
 * Metadata key for the decorator. Production callers shouldn't read this
 * directly — use `@RequireVerifiedEmail()`.
 */
export const REQUIRE_VERIFIED_EMAIL_KEY = 'rbac:verified-email';

/**
 * Mark a handler (or controller) as requiring a verified email. The actual
 * check happens in `RequireVerifiedEmailGuard`. Capability checks
 * (`@RequireCapability`) and verification are independent — a user can
 * hold a capability but still be unverified.
 *
 * Pattern:
 *   @Post()
 *   @RequireCapability('manage_api_keys')
 *   @RequireVerifiedEmail()
 *   create(...) { ... }
 *
 * Stable error code: `email_not_verified` (matches the identity-service
 * Go middleware so frontends can match on a single string across the
 * whole platform).
 */
export const RequireVerifiedEmail = () =>
  SetMetadata(REQUIRE_VERIFIED_EMAIL_KEY, true);

/**
 * Guard that 403s unverified users on writes. Wire as a global APP_GUARD
 * after `SessionCookieGuard` (which populates `request.user.id`) — the
 * guard is a no-op on routes without `@RequireVerifiedEmail()`, so cost
 * on read paths is one reflector lookup.
 *
 * Reads `users.email_verified` directly via `SESSION_DB_CLIENT` (the same
 * Prisma client `SessionCookieGuard` uses). No caching, by design — the
 * verification window is the one place we want fresh state, and the only
 * cost is one indexed lookup by user id.
 */
@Injectable()
export class RequireVerifiedEmailGuard implements CanActivate {
  private readonly logger = new Logger(RequireVerifiedEmailGuard.name);

  constructor(
    private readonly reflector: Reflector,
    @Inject(SESSION_DB_CLIENT) private readonly db: SessionDbClient,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<boolean | undefined>(
      REQUIRE_VERIFIED_EMAIL_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!required) return true;

    const req = ctx.switchToHttp().getRequest<{
      user?: { id?: string; emailVerified?: boolean };
      method?: string;
      url?: string;
    }>();
    if (!req.user?.id) {
      // No auth context — SessionCookieGuard would already have rejected
      // the request. Defensive only.
      return true;
    }

    // Per-request memo so multiple gated handlers in the same chain
    // (e.g. interceptors + the handler itself) only hit the DB once.
    if (typeof req.user.emailVerified === 'boolean') {
      if (!req.user.emailVerified) {
        this.emitDenied(req);
        throw this.forbidden();
      }
      return true;
    }

    try {
      const rows = await this.db.$queryRaw<
        Array<{ email_verified: boolean }>
      >`SELECT email_verified FROM users WHERE id = ${req.user.id}::uuid LIMIT 1`;
      const verified = rows?.[0]?.email_verified ?? false;
      req.user.emailVerified = verified;
      if (!verified) {
        this.emitDenied(req);
        throw this.forbidden();
      }
      return true;
    } catch (err) {
      if (err instanceof ForbiddenException) throw err;
      this.logger.error(
        `verified-email lookup failed for user ${req.user.id}: ${
          (err as Error).message
        }`,
      );
      // Fail closed — but with a distinct shape so ops can grep for it.
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        message: 'email_not_verified',
        reason: 'verification_check_failed',
      });
    }
  }

  private forbidden(): ForbiddenException {
    return new ForbiddenException({
      statusCode: 403,
      error: 'Forbidden',
      message: 'email_not_verified',
      detail:
        'this action requires a verified email — check your inbox for the verification link',
    });
  }

  // Fire-and-forget audit emission. Lives on the instance so the test
  // suite doesn't need to mock the audit table for the rejection paths
  // (the guard-audit helper itself swallows DB errors).
  private emitDenied(req: {
    user?: { id?: string };
    method?: string;
    url?: string;
  }): void {
    if (!req.user?.id) return;
    void emitGuardAuditEvent(
      this.db,
      {
        action: 'rbac.email_not_verified',
        actorId: req.user.id,
        tenantId: null,
        resourceType: 'http_route',
        resourceId: `${req.method ?? 'GET'} ${req.url ?? '?'}`,
      },
      this.logger,
    );
  }
}
