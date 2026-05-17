import {
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import type {
  MembershipRole,
  PlatformAdminRole,
  SessionMeDto,
  TenantKind,
} from '@sso-platform/shared-types';
import { computeCapabilities, type AuthSession } from '@sso-platform/nestjs-auth';
import { PrismaService } from '../shared/prisma/prisma.service';

// Shape returned by identity-service's GET /auth/session/memberships.
// Matches MembershipView in apps/identity-service/internal/service/active_tenant.go.
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

/**
 * Orchestrates the /api/v1/session/me payload.
 *
 * Three reads, one compose:
 *   1. GET identity-service:3000/auth/session/memberships — forwards the
 *      sso_session cookie. Returns the user's tenants + which is active.
 *   2. Local Prisma — fetch user profile (email, emailVerified, display name).
 *   3. Local Prisma — fetch the platform_admins row for the user (may be null).
 *   4. computeCapabilities() — pure derivation; see capabilities.ts.
 *
 * Identity-service stays the authoritative source for session + membership
 * composition; admin-api owns platform_admins and capability derivation. The
 * cross-service HTTP is one hop on the same k8s network (< 2ms in prod).
 */
@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private readonly identityServiceUrl =
    process.env.IDENTITY_SERVICE_URL || 'http://localhost:3000';

  constructor(private readonly prisma: PrismaService) {}

  async getMe(auth: AuthSession, rawCookieHeader: string): Promise<SessionMeDto> {
    // Parallelize the independent reads. Failures of any read are mapped to
    // a single 500 because SessionMeDto must be internally consistent.
    const [memberships, user, platform, session] = await Promise.all([
      this.fetchMemberships(rawCookieHeader),
      this.prisma.user.findUnique({
        where: { id: auth.id },
        select: {
          id: true,
          email: true,
          emailVerified: true,
          displayName: true,
          avatarUrl: true,
        },
      }),
      this.prisma.platformAdmin.findUnique({
        where: { userId: auth.id },
        select: { role: true, grantedAt: true, revokedAt: true },
      }),
      this.prisma.session.findUnique({
        where: { id: auth.sessionId },
        select: { id: true, expiresAt: true },
      }),
    ]);

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

    // Bind both fields together so the `!` non-null assertion isn't needed
    // downstream — TS can narrow `activePlatform` cleanly.
    const activePlatform =
      platform && !platform.revokedAt
        ? { role: platform.role as PlatformAdminRole, grantedAt: platform.grantedAt }
        : null;

    const capabilities = computeCapabilities({
      platformRole: activePlatform?.role ?? null,
      activeMembershipRole: activeMembership?.role ?? null,
      activeTenantKind: activeMembership?.tenant_kind ?? null,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
        displayName: user.displayName ?? undefined,
        avatarUrl: user.avatarUrl ?? undefined,
      },
      session: {
        id: session.id,
        expiresAt: session.expiresAt.toISOString(),
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
            grantedAt: activePlatform.grantedAt.toISOString(),
          }
        : null,
      capabilities,
    };
  }

  /**
   * Forward the caller's sso_session cookie to identity-service. No admin-api
   * credentials are used — authZ is entirely derived from the user's cookie.
   */
  private async fetchMemberships(
    cookieHeader: string,
  ): Promise<IdentityMembershipsResponse> {
    const url = `${this.identityServiceUrl}/auth/session/memberships`;
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Cookie: cookieHeader,
          Accept: 'application/json',
        },
        // Never follow redirects — an unexpected redirect would be a
        // mis-configuration, not an auth flow.
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
}
