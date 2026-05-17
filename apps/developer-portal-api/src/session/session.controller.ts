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

/**
 * Bootstrap endpoint for the developer-portal shell. Returns the user,
 * their session, memberships, active tenant, optional platform-admin
 * status, and the pre-computed `capabilities` the UI uses to render nav
 * + route guards.
 *
 * Counterpart of admin-api's `/api/v1/session/me`. Both endpoints return
 * the same `SessionMeDto` shape from libs/shared-types so the consoles can
 * share their SessionStore logic via libs/auth-guards.
 *
 * Guarded by the app-global `SessionCookieGuard`. No capability check —
 * the endpoint is open to any authenticated user; capability data is the
 * *output*, not a pre-condition.
 */
@ApiTags('session')
@ApiBearerAuth()
@Controller('api/v1/session')
export class SessionController {
  constructor(private readonly svc: SessionService) {}

  @Get('me')
  @ApiOperation({
    summary:
      'Return the authenticated session + memberships + capabilities for the developer-portal shell',
  })
  @ApiOkResponse({ description: 'SessionMeDto shape (see libs/shared-types)' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid sso_session cookie' })
  async me(
    @CurrentUser() user: AuthSession,
    @Req() req: Request,
  ): Promise<SessionMeDto> {
    // Forward the raw Cookie header so identity-service authenticates the
    // membership-lookup as the same user. We never use developer-portal-api
    // credentials for this hop — the session belongs to the user.
    return this.svc.getMe(user, req.headers.cookie ?? '');
  }
}
