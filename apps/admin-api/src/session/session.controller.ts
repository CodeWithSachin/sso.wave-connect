import { Controller, Get, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import type { SessionMeDto } from '@sso-platform/shared-types';
import { CurrentUser, type AuthSession } from '@sso-platform/nestjs-auth';
import { SessionService } from './session.service';
import { SessionMeResponseDto } from './dto/session-me.dto';

/**
 * Bootstrap endpoint for the admin-console shell. Returns the user, their
 * session, memberships, active tenant, platform-admin status, and the
 * pre-computed `capabilities` the UI renders without re-derivation.
 *
 * Guarded by the app-global SessionCookieGuard (see AppModule) — no
 * @UseGuards needed here. `@CurrentUser()` supplies the authenticated shape.
 */
@ApiTags('session')
@ApiBearerAuth()
@Controller('api/v1/session')
export class SessionController {
  constructor(private readonly svc: SessionService) {}

  @Get('me')
  @ApiOperation({
    summary:
      'Return the authenticated session + memberships + capabilities for the admin-console shell',
  })
  @ApiOkResponse({ type: SessionMeResponseDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid sso_session cookie' })
  async me(
    @CurrentUser() user: AuthSession,
    @Req() req: Request,
  ): Promise<SessionMeDto> {
    // Forward the raw Cookie header so identity-service sees the same
    // sso_session value that authenticated this call. Fallback to a
    // reconstructed header if cookie-parser stripped the original.
    const cookieHeader =
      (req.headers.cookie as string | undefined) ??
      (req.cookies?.['sso_session']
        ? `sso_session=${req.cookies['sso_session']}`
        : '');
    return this.svc.getMe(user, cookieHeader);
  }
}
