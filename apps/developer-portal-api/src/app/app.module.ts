import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import {
  RequireCapabilityGuard,
  RequireVerifiedEmailGuard,
  SessionCookieGuard,
  SESSION_DB_CLIENT,
} from '@sso-platform/nestjs-auth';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { PrismaService } from '../shared/prisma/prisma.service';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { OAuthAppsModule } from '../oauth-apps/oauth-apps.module';
import { ScimTokensModule } from '../scim-tokens/scim-tokens.module';
import { DocsModule } from '../docs/docs.module';
import { SessionModule } from '../session/session.module';

@Module({
  imports: [
    PrismaModule,
    ApiKeysModule,
    OAuthAppsModule,
    ScimTokensModule,
    DocsModule,
    SessionModule,
  ],
  providers: [
    // SessionCookieGuard validates the sso_session cookie and populates request.user.
    // Apply globally — every route requires a valid session unless explicitly marked @Public.
    { provide: SESSION_DB_CLIENT, useExisting: PrismaService },
    { provide: APP_GUARD, useClass: SessionCookieGuard },
    // RequireCapabilityGuard runs after SessionCookieGuard and is a no-op on
    // routes without @RequireCapability(). When a route is decorated it
    // lazily derives caps from identity-service memberships + the local
    // platform_admins table. In developer-portal-api no endpoint gates on
    // platform caps, so the platform_admins lookup branch is effectively
    // dead weight here — but providing SESSION_DB_CLIENT keeps the guard
    // behavior symmetric with admin-api in case a platform-gated endpoint
    // ever lands. See ADR-0002.
    { provide: APP_GUARD, useClass: RequireCapabilityGuard },
    // E2E review A1 — @RequireVerifiedEmail() routes 403 unverified users
    // with `email_not_verified`. No-op on undecorated routes.
    { provide: APP_GUARD, useClass: RequireVerifiedEmailGuard },
  ],
})
export class AppModule {}
