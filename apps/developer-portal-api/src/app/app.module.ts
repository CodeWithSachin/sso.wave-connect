import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/prisma/prisma.module';
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
})
export class AppModule {}
