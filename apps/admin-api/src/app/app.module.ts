import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { SessionCookieGuard, SESSION_DB_CLIENT } from '@sso-platform/nestjs-auth';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { PrismaService } from '../shared/prisma/prisma.service';
import { TenantsModule } from '../tenants/tenants.module';
import { UsersModule } from '../users/users.module';
import { MembershipsModule } from '../memberships/memberships.module';
import { GroupsModule } from '../groups/groups.module';
import { IdpModule } from '../identity-providers/idp.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    PrismaModule,
    TenantsModule,
    UsersModule,
    MembershipsModule,
    GroupsModule,
    IdpModule,
    SettingsModule,
  ],
  providers: [
    // SessionCookieGuard validates sso_session against the sessions table and
    // populates request.user = { id, tenantId, sessionId } for every route.
    { provide: SESSION_DB_CLIENT, useExisting: PrismaService },
    { provide: APP_GUARD, useClass: SessionCookieGuard },
  ],
})
export class AppModule {}
