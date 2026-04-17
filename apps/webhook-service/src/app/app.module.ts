import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { SessionCookieGuard, SESSION_DB_CLIENT } from '@sso-platform/nestjs-auth';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { PrismaService } from '../shared/prisma/prisma.service';
import { WebhooksModule } from '../webhooks/webhooks.module';

@Module({
  imports: [PrismaModule, WebhooksModule],
  providers: [
    { provide: SESSION_DB_CLIENT, useExisting: PrismaService },
    { provide: APP_GUARD, useClass: SessionCookieGuard },
  ],
})
export class AppModule {}
