import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/prisma/prisma.module';
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
})
export class AppModule {}
