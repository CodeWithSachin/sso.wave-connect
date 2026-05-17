import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'crypto';

/**
 * Injection token for the database client used to look up sessions.
 * Each NestJS app should provide its own PrismaService (or equivalent) for this token:
 *
 * ```ts
 * // In app.module.ts
 * providers: [
 *   { provide: SESSION_DB_CLIENT, useExisting: PrismaService },
 *   { provide: APP_GUARD, useClass: SessionCookieGuard },
 * ]
 * ```
 */
export const SESSION_DB_CLIENT = Symbol('SESSION_DB_CLIENT');

/**
 * Minimal DB client contract — works with any PrismaClient instance or a
 * custom wrapper. `$executeRaw` is used by the audit-emission helper
 * (libs/nestjs-auth/src/lib/guard-audit.ts) to write rbac.* rejection rows.
 */
export interface SessionDbClient {
  $queryRaw<T = unknown>(
    query: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T>;
  $executeRaw(
    query: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<number>;
}

/**
 * Shape placed on `request.user` when the guard passes.
 * Consumed by `@CurrentUser()` and `@TenantId()` decorators.
 */
export interface AuthSession {
  id: string;
  tenantId: string;
  sessionId: string;
  /** Alias for sessionId — kept for compatibility with PasetoGuard's AuthUser shape. */
  jti: string;
}

interface SessionRow {
  id: string;
  user_id: string;
  tenant_id: string;
}

/**
 * Validates the `sso_session` HttpOnly cookie set by identity-service on login.
 *
 * Flow (mirrors `apps/sso-service/internal/middleware/session_cookie.go`):
 *   1. Read `sso_session` cookie from the request.
 *   2. base64url-decode the raw token, SHA-256 it, and compare (hex-encoded) against `sessions.token_hash`.
 *   3. Only rows with `status='active' AND expires_at > NOW()` are accepted.
 *   4. Populates `request.user = { id, tenantId, sessionId, jti }` for downstream controllers.
 *
 * Requires `cookie-parser` middleware registered in each app's `main.ts`:
 *   `app.use(cookieParser())`.
 */
@Injectable()
export class SessionCookieGuard implements CanActivate {
  private readonly logger = new Logger(SessionCookieGuard.name);

  constructor(
    @Optional() @Inject(SESSION_DB_CLIENT) private readonly db: SessionDbClient | null,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const request = ctx.switchToHttp().getRequest();

    // cookie-parser populates request.cookies; fall back to parsing the raw header if absent
    const cookieValue: string | undefined =
      request.cookies?.['sso_session'] ?? this.parseRawCookie(request.headers?.cookie);

    if (!cookieValue) {
      throw new UnauthorizedException('Missing sso_session cookie');
    }

    if (!this.db) {
      this.logger.error(
        'SessionCookieGuard is active but SESSION_DB_CLIENT was not provided in the module.',
      );
      throw new UnauthorizedException('Session validation is not configured');
    }

    const tokenHash = this.hashCookieToken(cookieValue);
    if (!tokenHash) {
      throw new UnauthorizedException('Invalid sso_session cookie format');
    }

    try {
      const rows = await this.db.$queryRaw<SessionRow[]>`
        SELECT id, user_id, tenant_id
        FROM sessions
        WHERE token_hash = ${tokenHash}
          AND status = 'active'
          AND expires_at > NOW()
        LIMIT 1
      `;

      if (!rows || rows.length === 0) {
        throw new UnauthorizedException('Invalid or expired session');
      }

      const row = rows[0];
      const session: AuthSession = {
        id: row.user_id,
        tenantId: row.tenant_id,
        sessionId: row.id,
        jti: row.id,
      };
      request['user'] = session;
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.warn(`Session validation failed: ${(error as Error).message}`);
      throw new UnauthorizedException('Invalid or expired session');
    }
  }

  /**
   * SHA-256 hash of the base64url-decoded raw token, returned as lowercase hex.
   * Matches the storage format of `sessions.token_hash` written by identity-service.
   */
  private hashCookieToken(rawToken: string): string | null {
    try {
      const normalized = rawToken.replace(/-/g, '+').replace(/_/g, '/');
      const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
      const decoded = Buffer.from(padded, 'base64');
      return createHash('sha256').update(decoded).digest('hex');
    } catch {
      return null;
    }
  }

  /**
   * Fallback cookie parser for cases where `cookie-parser` middleware isn't registered.
   * Extracts only the `sso_session` value from a raw `Cookie` header.
   */
  private parseRawCookie(cookieHeader: string | undefined): string | undefined {
    if (!cookieHeader) return undefined;
    for (const pair of cookieHeader.split(';')) {
      const [name, ...rest] = pair.trim().split('=');
      if (name === 'sso_session') {
        return rest.join('=');
      }
    }
    return undefined;
  }
}
