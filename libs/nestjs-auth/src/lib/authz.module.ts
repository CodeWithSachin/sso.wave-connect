import { Module } from '@nestjs/common';
import { PasetoGuard } from './paseto.guard.js';
import { RebacGuard } from './rebac.guard.js';
import { SessionCookieGuard } from './session-cookie.guard.js';
import { PlatformAdminGuard } from './platform-admin.guard.js';

@Module({
  providers: [PasetoGuard, RebacGuard, SessionCookieGuard, PlatformAdminGuard],
  exports: [PasetoGuard, RebacGuard, SessionCookieGuard, PlatformAdminGuard],
})
export class AuthzModule {}
