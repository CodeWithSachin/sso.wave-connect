import { Controller, Get, Req, Sse, type MessageEvent } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { map, merge, Observable, timer } from 'rxjs';
import type { SessionMeDto } from '@sso-platform/shared-types';
import { CurrentUser, type AuthSession } from '@sso-platform/nestjs-auth';
import { NatsService } from './nats.service';
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
  constructor(
    private readonly svc: SessionService,
    private readonly nats: NatsService,
  ) {}

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

  /**
   * Phase 3 SSE push channel — counterpart of admin-api's /session/events.
   * Emits `invalidate` events when membership / role state changes for
   * the connected user. Developer-portal's SessionStore reloads on each
   * event.
   *
   * Heartbeat `ping` every 25s prevents idle proxy disconnects.
   */
  @Sse('events')
  @ApiOperation({
    summary: 'Push channel for session invalidations (SSE).',
  })
  events(@CurrentUser() user: AuthSession): Observable<MessageEvent> {
    const invalidations$ = this.nats.watchUser(user.id).pipe(
      map((reason) => ({ type: 'invalidate', data: reason }) as MessageEvent),
    );
    const heartbeat$ = timer(0, 25_000).pipe(
      map(() => ({ type: 'ping', data: 'ok' }) as MessageEvent),
    );
    return merge(invalidations$, heartbeat$);
  }
}
