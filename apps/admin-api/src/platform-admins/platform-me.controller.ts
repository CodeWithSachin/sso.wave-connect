import { Controller, Get } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser, type AuthSession } from '@sso-platform/nestjs-auth';
import { PrismaService } from '../shared/prisma/prisma.service';
import { PlatformMeResponseDto } from './dto/platform-me-response.dto';

/**
 * `GET /api/v1/platform/me` — "do I currently hold any platform-admin role?"
 *
 * Open to any authenticated user (auth-only; no `PlatformAdminGuard`). A
 * non-platform-admin gets `{ role: null, grantedAt: null }` rather than 403.
 *
 * Reason this exists separately from `/api/v1/platform/admins/:userId`:
 *   - developer-portal-api needs the answer for its `/session/me` composition
 *     but doesn't model `platform_admins` in its own Prisma schema. The
 *     previous workaround was raw SQL across services on a shared database —
 *     a leaky coupling that ADR-0002's architecture review flagged. This
 *     endpoint replaces that read with an HTTP call to the service that
 *     actually owns the table.
 *   - The platform-admins controller's `findOne(:userId)` is gated by
 *     `PlatformAdminGuard`, which rejects non-platform-admins — wrong gate
 *     for "tell me about myself."
 */
@ApiTags('platform-admins')
@ApiBearerAuth()
@Controller('api/v1/platform/me')
export class PlatformMeController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({
    summary: 'Get the caller\'s active platform-admin role (null if none)',
  })
  @ApiOkResponse({ type: PlatformMeResponseDto })
  @ApiUnauthorizedResponse({ description: 'No valid session cookie' })
  async getMe(@CurrentUser() me: AuthSession): Promise<PlatformMeResponseDto> {
    const row = await this.prisma.platformAdmin.findUnique({
      where: { userId: me.id },
    });
    if (!row || row.revokedAt) {
      return { role: null, grantedAt: null };
    }
    return {
      role: row.role as PlatformMeResponseDto['role'],
      grantedAt: row.grantedAt.toISOString(),
    };
  }
}
