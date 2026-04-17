import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { SessionCookieGuard, SESSION_DB_CLIENT } from '@sso-platform/nestjs-auth';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { PrismaService } from '../shared/prisma/prisma.service';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { OAuthAppsModule } from '../oauth-apps/oauth-apps.module';
import { ScimTokensModule } from '../scim-tokens/scim-tokens.module';
import { DocsModule } from '../docs/docs.module';

@Module({
  imports: [
    PrismaModule,
    ApiKeysModule,
    OAuthAppsModule,
    ScimTokensModule,
    DocsModule,
  ],
  providers: [
    // SessionCookieGuard validates the sso_session cookie and populates request.user.
    // Apply globally — every route requires a valid session unless explicitly marked @Public.
    { provide: SESSION_DB_CLIENT, useExisting: PrismaService },
    { provide: APP_GUARD, useClass: SessionCookieGuard },
  ],
})
export class AppModule {}
