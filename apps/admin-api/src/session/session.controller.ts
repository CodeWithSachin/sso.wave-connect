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
  constructor(
    private readonly svc: SessionService,
    private readonly nats: NatsService,
  ) {}

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

  /**
   * Phase 3 SSE push channel. Streams `invalidate` events keyed to the
   * authenticated user; admin-console's SessionStore listens here and
   * triggers `reload()` on each event so role / membership / platform-
   * admin changes propagate within seconds rather than the previous
   * 30s polling cadence.
   *
   * Heartbeat: a `ping` every 25s keeps proxies from idling the
   * long-lived connection out. Browsers ignore unknown event types.
   *
   * The connection inherits the global SessionCookieGuard chain — no
   * special @UseGuards needed.
   */
  @Sse('events')
  @ApiOperation({
    summary: 'Push channel for session invalidations (SSE).',
    description:
      'Emits `invalidate` events when membership / role / platform-admin state changes for the connected user. Heartbeats with `ping` every 25s.',
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
