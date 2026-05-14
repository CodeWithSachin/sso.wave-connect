import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import {
  PlatformAdminGuard,
  SessionCookieGuard,
  SESSION_DB_CLIENT,
} from '@sso-platform/nestjs-auth';
import {
  EmailModule,
  type EmailProviderKind,
} from '@sso-platform/nestjs-email';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { PrismaService } from '../shared/prisma/prisma.service';
import { CryptoModule } from '../shared/crypto/crypto.module';
import { TenantsModule } from '../tenants/tenants.module';
import { UsersModule } from '../users/users.module';
import { MembershipsModule } from '../memberships/memberships.module';
import { GroupsModule } from '../groups/groups.module';
import { IdpModule } from '../identity-providers/idp.module';
import { SettingsModule } from '../settings/settings.module';
import { PlatformAdminsModule } from '../platform-admins/platform-admins.module';
import { SessionModule } from '../session/session.module';

// EMAIL_PROVIDER env: 'console' (default, dev-only) | 'ses' (prod, stub until Phase 2).
// Validated at module-import time so a typo fails boot rather than first send.
const emailProvider: EmailProviderKind =
  (process.env.EMAIL_PROVIDER as EmailProviderKind) ?? 'console';

@Module({
  imports: [
    PrismaModule,
    CryptoModule,
    EmailModule.forRoot({ provider: emailProvider }),
    TenantsModule,
    UsersModule,
    MembershipsModule,
    GroupsModule,
    IdpModule,
    SettingsModule,
    PlatformAdminsModule,
    SessionModule,
  ],
  providers: [
    // SessionCookieGuard validates sso_session against the sessions table and
    // populates request.user = { id, tenantId, sessionId } for every route.
    { provide: SESSION_DB_CLIENT, useExisting: PrismaService },
    { provide: APP_GUARD, useClass: SessionCookieGuard },
    // PlatformAdminGuard is NOT app-global — controllers opt in via @UseGuards.
    // Exposed here so DI can resolve it when controllers list it in their guard array.
    PlatformAdminGuard,
  ],
})
export class AppModule {}
