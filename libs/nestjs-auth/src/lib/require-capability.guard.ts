import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type {
  Capability,
  MembershipRole,
  PlatformAdminRole,
  TenantKind,
} from '@sso-platform/shared-types';
import { computeCapabilities } from './capabilities.js';
import { emitGuardAuditEvent } from './guard-audit.js';
import {
  SESSION_DB_CLIENT,
  type SessionDbClient,
} from './session-cookie.guard.js';

/**
 * Metadata key. Exported for tests and any external reflection; production
 * code should use the `RequireCapability(...)` decorator instead.
 */
export const REQUIRE_CAPABILITY_KEY = 'rbac:caps';

/**
 * Decorator: declare which capabilities the route requires.
 *
 *   @RequireCapability('manage_scim_tokens')
 *   @Post()
 *   create(...) { ... }
 *
 * Multiple capabilities = union (any-of). Matches the Angular
 * `requireCapability(...)` route guard so backend + frontend gates align.
 */
export const RequireCapability = (...caps: Capability[]) =>
  SetMetadata(REQUIRE_CAPABILITY_KEY, caps);

const IDENTITY_DEFAULT_URL = 'http://localhost:3000';
const CACHE_TTL_MS = 30_000;
const CACHE_MAX_ENTRIES = 10_000;

interface IdentityMembership {
  tenant_id: string;
  tenant_kind: TenantKind;
  role: MembershipRole;
  is_active: boolean;
}

interface PlatformAdminRow {
  role: PlatformAdminRole;
  revoked_at: Date | null;
}

interface CacheEntry {
  caps: Capability[];
  expiresAt: number;
}

/**
 * Internal sentinel: the lookup itself failed (network, DB, identity-service
 * down). Distinct from "lookup succeeded and returned no privileges" — the
 * latter is fine and produces an empty capability set; the former must NOT
 * be papered over as a 403, because that would tell a caller "you don't
 * have permission" when the truth is "we couldn't tell."
 */
class LookupError extends Error {
  constructor(message: string, override readonly cause?: unknown) {
    super(message);
    this.name = 'LookupError';
  }
}

/**
 * Guard counterpart of `RequireCapability`.
 *
 * Layered caching:
 *   1. `request.user.capabilities` — per-request memo, set on first decorated
 *      handler in the chain.
 *   2. In-process `Map<sessionId, CacheEntry>` — per-session-id, 30 s TTL.
 *      Matches the consoles' poll cadence on `/session/me`; a revoked role
 *      disappears from the UI within 30 s, and from backend enforcement
 *      within the same window. Bounded at 10 000 entries with eldest-key
 *      eviction (JS `Map` preserves insertion order).
 *
 * Lookup failures surface as **503** (`ServiceUnavailableException`), not
 * 403. Conflating "we can't check" with "you can't do this" is misleading
 * and makes outages look like permission bugs.
 *
 * `SESSION_DB_CLIENT` is `@Optional` — services without a `platform_admins`
 * table (developer-portal-api previously fell into this) wire null and the
 * guard returns `platformRole: null`, which `computeCapabilities` handles.
 */
@Injectable()
export class RequireCapabilityGuard implements CanActivate {
  private readonly logger = new Logger(RequireCapabilityGuard.name);
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly reflector: Reflector,
    @Optional()
    @Inject(SESSION_DB_CLIENT)
    private readonly db: SessionDbClient | null,
  ) {
    if (
      process.env['NODE_ENV'] === 'production' &&
      !process.env['IDENTITY_SERVICE_URL']
    ) {
      throw new Error(
        'IDENTITY_SERVICE_URL must be set in production — refusing to start ' +
          'with localhost fallback that would silently break capability checks.',
      );
    }
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Capability[] | undefined>(
      REQUIRE_CAPABILITY_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!required || required.length === 0) {
      return true;
    }

    const req = ctx.switchToHttp().getRequest<{
      user?: { id?: string; sessionId?: string; capabilities?: Capability[] };
      cookies?: Record<string, string | undefined>;
      headers?: Record<string, string | string[] | undefined>;
      method?: string;
      url?: string;
    }>();

    if (!req.user?.id) {
      throw new UnauthorizedException('Authentication required');
    }

    let caps: Capability[];
    if (req.user.capabilities) {
      caps = req.user.capabilities;
    } else {
      const cached = req.user.sessionId
        ? this.cacheGet(req.user.sessionId)
        : null;
      if (cached) {
        caps = cached;
      } else {
        try {
          caps = await this.deriveCapabilities(req);
        } catch (err) {
          if (err instanceof LookupError) {
            this.logger.error(
              `capability lookup failed for user ${req.user.id}: ${err.message}`,
            );
            throw new ServiceUnavailableException({
              statusCode: 503,
              error: 'Service Unavailable',
              message: 'capability_check_failed',
            });
          }
          throw err;
        }
        if (req.user.sessionId) this.cacheSet(req.user.sessionId, caps);
      }
      req.user.capabilities = caps;
    }

    const ok = required.some((c) => caps.includes(c));
    if (!ok) {
      // Fire an audit row (Phase E from the arch review). Best-effort —
      // don't await; the 403 is the actual protection, the audit is
      // forensics. We pass the route as `resource_id` so a log search
      // for "rbac.capability_denied resource_id=<path>" tells you which
      // endpoint someone tried to hit.
      void emitGuardAuditEvent(
        this.db,
        {
          action: 'rbac.capability_denied',
          actorId: req.user.id,
          tenantId: null,
          resourceType: 'http_route',
          resourceId: `${req.method ?? 'GET'} ${req.url ?? '?'}`,
          metadata: { required, have: caps },
        },
        this.logger,
      );
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        message: 'insufficient_capability',
        required,
      });
    }
    return true;
  }

  private cacheGet(sessionId: string): Capability[] | null {
    const entry = this.cache.get(sessionId);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(sessionId);
      return null;
    }
    return entry.caps;
  }

  private cacheSet(sessionId: string, caps: Capability[]): void {
    if (this.cache.size >= CACHE_MAX_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(sessionId, {
      caps,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
  }

  private async deriveCapabilities(req: {
    user?: { id?: string };
    cookies?: Record<string, string | undefined>;
    headers?: Record<string, string | string[] | undefined>;
  }): Promise<Capability[]> {
    const userId = req.user?.id;
    if (!userId) return [];

    const ssoSession = this.extractSsoSessionCookie(req);
    if (!ssoSession) {
      // SessionCookieGuard ran upstream and authenticated the user — but
      // we still need a cookie to forward to identity-service. If it
      // isn't there now, something stripped it between guards.
      throw new LookupError('sso_session cookie missing on request');
    }

    const [memberships, platformAdmin] = await Promise.all([
      this.fetchMemberships(ssoSession),
      this.fetchPlatformAdmin(userId),
    ]);

    const active = memberships.find((m) => m.is_active);
    return computeCapabilities({
      platformRole: platformAdmin?.role ?? null,
      activeMembershipRole: active?.role ?? null,
      activeTenantKind: active?.tenant_kind ?? null,
    });
  }

  private async fetchMemberships(
    ssoSessionValue: string,
  ): Promise<IdentityMembership[]> {
    const base = process.env['IDENTITY_SERVICE_URL'] ?? IDENTITY_DEFAULT_URL;
    const url = `${base.replace(/\/+$/, '')}/auth/session/memberships`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'GET',
        headers: {
          // Forward ONLY sso_session — not the rest of the caller's
          // cookie jar. Other cookies (CSRF tokens, browser ad cookies,
          // PKCE state) have no business reaching identity-service and
          // leaking them widens the trust boundary unnecessarily.
          Cookie: `sso_session=${ssoSessionValue}`,
          Accept: 'application/json',
        },
        redirect: 'error',
      });
    } catch (err) {
      throw new LookupError(
        `identity-service unreachable: ${(err as Error).message}`,
        err,
      );
    }
    if (res.status === 401) {
      // The cookie is no longer valid. This is a real auth failure,
      // not an outage — bubble it up so the client sees 401 (and the
      // console clears its session).
      throw new UnauthorizedException('Session expired');
    }
    if (!res.ok) {
      throw new LookupError(
        `identity-service returned ${res.status} for memberships`,
      );
    }
    const body = (await res.json()) as { memberships?: IdentityMembership[] };
    return body.memberships ?? [];
  }

  private async fetchPlatformAdmin(
    userId: string,
  ): Promise<PlatformAdminRow | null> {
    if (!this.db) return null;
    try {
      const rows = await this.db.$queryRaw<PlatformAdminRow[]>`
        SELECT role, revoked_at
        FROM platform_admins
        WHERE user_id = ${userId}::uuid
        LIMIT 1
      `;
      const row = rows?.[0];
      if (!row || row.revoked_at) return null;
      return row;
    } catch (err) {
      throw new LookupError(
        `platform_admins lookup failed: ${(err as Error).message}`,
        err,
      );
    }
  }

  /**
   * Read only `sso_session`. Falls back to parsing the raw `Cookie:` header
   * if cookie-parser middleware isn't installed — but still extracts that
   * one cookie only.
   */
  private extractSsoSessionCookie(req: {
    cookies?: Record<string, string | undefined>;
    headers?: Record<string, string | string[] | undefined>;
  }): string | null {
    const fromParsed = req.cookies?.['sso_session'];
    if (typeof fromParsed === 'string' && fromParsed.length > 0) {
      return fromParsed;
    }
    const raw = req.headers?.['cookie'];
    const rawString = Array.isArray(raw) ? raw.join('; ') : raw;
    if (typeof rawString !== 'string' || rawString.length === 0) return null;
    for (const part of rawString.split(';')) {
      const [name, ...rest] = part.trim().split('=');
      if (name === 'sso_session' && rest.length > 0) {
        return rest.join('=');
      }
    }
    return null;
  }
}
