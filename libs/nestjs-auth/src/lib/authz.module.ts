import { Module } from '@nestjs/common';
import { PasetoGuard } from './paseto.guard.js';
import { RebacGuard } from './rebac.guard.js';
import { SessionCookieGuard } from './session-cookie.guard.js';

@Module({
  providers: [PasetoGuard, RebacGuard, SessionCookieGuard],
  exports: [PasetoGuard, RebacGuard, SessionCookieGuard],
})
export class AuthzModule {}
