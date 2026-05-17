import {
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import type {
  Capability,
  MembershipRole,
  PlatformAdminRole,
  SessionMeDto,
  TenantKind,
} from '@sso-platform/shared-types';
import { computeCapabilities, type AuthSession } from '@sso-platform/nestjs-auth';
import { PrismaService } from '../shared/prisma/prisma.service';

// Mirrors the shape returned by identity-service GET /auth/session/memberships
// (apps/identity-service/internal/service/active_tenant.go::MembershipView).
interface IdentityMembership {
  tenant_id: string;
  tenant_slug: string;
  tenant_name: string;
  tenant_kind: TenantKind;
  role: MembershipRole;
  is_active: boolean;
}

interface IdentityMembershipsResponse {
  memberships: IdentityMembership[];
  active_tenant_id: string;
}

interface UserRow {
  id: string;
  email: string;
  email_verified: boolean;
  display_name: string | null;
  avatar_url: string | null;
}

interface SessionRow {
  id: string;
  expires_at: Date;
}

interface PlatformMeResponse {
  role: PlatformAdminRole | null;
  grantedAt: string | null;
}

/**
 * Composes `GET /api/v1/session/me` for the developer-portal shell.
 *
 * Mirrors admin-api's `SessionService`. ADR-0002 architecture-review item B:
 * the `platform_admins` table is owned by admin-api (it carries the Prisma
 * model + grant/revoke handlers). developer-portal-api used to raw-SQL the
 * table directly across a shared database, which made the schema implicitly
 * cross-service. We now fetch `GET /api/v1/platform/me` on admin-api
 * instead, so admin-api stays the sole owner of that table.
 *
 * The remaining raw-SQL reads (`users`, `sessions`) are intentional:
 *   - `users` is conceptually owned by identity-service but the table is
 *     in the shared DB; admin-api also reads it via Prisma. A future
 *     identity-service HTTP read is a deeper change than this ADR scope.
 *   - `sessions` is read only for expiry metadata and is genuinely shared.
 */
@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private readonly identityServiceUrl =
    process.env['IDENTITY_SERVICE_URL'] ?? 'http://localhost:3000';
  private readonly adminApiUrl =
    process.env['ADMIN_API_URL'] ?? 'http://localhost:3100';

  constructor(private readonly prisma: PrismaService) {
    if (
      process.env['NODE_ENV'] === 'production' &&
      !process.env['ADMIN_API_URL']
    ) {
      throw new Error(
        'ADMIN_API_URL must be set in production — refusing to start ' +
          'with localhost fallback that would silently break /platform/me lookups.',
      );
    }
  }

  async getMe(auth: AuthSession, rawCookieHeader: string): Promise<SessionMeDto> {
    const [memberships, userRows, platformMe, sessionRows] = await Promise.all([
      this.fetchMemberships(rawCookieHeader),
      this.prisma.$queryRaw<UserRow[]>`
        SELECT id, email, email_verified, display_name, avatar_url
        FROM users
        WHERE id = ${auth.id}::uuid
        LIMIT 1
      `,
      this.fetchPlatformMe(rawCookieHeader),
      this.prisma.$queryRaw<SessionRow[]>`
        SELECT id, expires_at
        FROM sessions
        WHERE id = ${auth.sessionId}::uuid
        LIMIT 1
      `,
    ]);

    const user = userRows?.[0];
    const session = sessionRows?.[0];
    if (!user) throw new UnauthorizedException('User not found for session');
    if (!session) throw new UnauthorizedException('Session not found');

    const activeMembership =
      memberships.memberships.find((m) => m.is_active) ?? null;
    const activeTenant = activeMembership
      ? {
          id: activeMembership.tenant_id,
          slug: activeMembership.tenant_slug,
          name: activeMembership.tenant_name,
          kind: activeMembership.tenant_kind,
        }
      : null;

    const activePlatform = platformMe.role
      ? { role: platformMe.role, grantedAt: platformMe.grantedAt }
      : null;

    const capabilities: Capability[] = computeCapabilities({
      platformRole: activePlatform?.role ?? null,
      activeMembershipRole: activeMembership?.role ?? null,
      activeTenantKind: activeMembership?.tenant_kind ?? null,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        emailVerified: user.email_verified,
        displayName: user.display_name ?? undefined,
        avatarUrl: user.avatar_url ?? undefined,
      },
      session: {
        id: session.id,
        expiresAt: session.expires_at.toISOString(),
      },
      activeTenant,
      memberships: memberships.memberships.map((m) => ({
        tenantId: m.tenant_id,
        tenantSlug: m.tenant_slug,
        tenantName: m.tenant_name,
        tenantKind: m.tenant_kind,
        role: m.role,
        isActive: m.is_active,
      })),
      platform: activePlatform
        ? {
            role: activePlatform.role,
            grantedAt: activePlatform.grantedAt ?? new Date(0).toISOString(),
          }
        : null,
      capabilities,
    };
  }

  private async fetchMemberships(
    cookieHeader: string,
  ): Promise<IdentityMembershipsResponse> {
    const url = `${this.identityServiceUrl.replace(/\/+$/, '')}/auth/session/memberships`;
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { Cookie: cookieHeader, Accept: 'application/json' },
        redirect: 'error',
      });
      if (res.status === 401) {
        throw new UnauthorizedException('Session rejected by identity-service');
      }
      if (!res.ok) {
        throw new InternalServerErrorException(
          `identity-service returned ${res.status} for /auth/session/memberships`,
        );
      }
      return (await res.json()) as IdentityMembershipsResponse;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      if (err instanceof InternalServerErrorException) throw err;
      this.logger.error(
        `fetch memberships from identity-service failed: ${(err as Error).message}`,
      );
      throw new InternalServerErrorException('Session composition failed');
    }
  }

  private async fetchPlatformMe(cookieHeader: string): Promise<PlatformMeResponse> {
    const url = `${this.adminApiUrl.replace(/\/+$/, '')}/api/v1/platform/me`;
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { Cookie: cookieHeader, Accept: 'application/json' },
        redirect: 'error',
      });
      if (res.status === 401) {
        throw new UnauthorizedException('Session rejected by admin-api');
      }
      if (!res.ok) {
        throw new InternalServerErrorException(
          `admin-api returned ${res.status} for /api/v1/platform/me`,
        );
      }
      return (await res.json()) as PlatformMeResponse;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      if (err instanceof InternalServerErrorException) throw err;
      this.logger.error(
        `fetch /platform/me from admin-api failed: ${(err as Error).message}`,
      );
      throw new InternalServerErrorException('Session composition failed');
    }
  }
}
