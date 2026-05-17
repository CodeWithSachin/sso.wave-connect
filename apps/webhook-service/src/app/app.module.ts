import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import {
  RequireCapabilityGuard,
  SessionCookieGuard,
  SESSION_DB_CLIENT,
} from '@sso-platform/nestjs-auth';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { PrismaService } from '../shared/prisma/prisma.service';
import { WebhooksModule } from '../webhooks/webhooks.module';

@Module({
  imports: [PrismaModule, WebhooksModule],
  providers: [
    { provide: SESSION_DB_CLIENT, useExisting: PrismaService },
    { provide: APP_GUARD, useClass: SessionCookieGuard },
    // RequireCapabilityGuard wired as part of Item 1.2 cap-split: webhook-service
    // previously enforced only SessionCookieGuard, so @RequireCapability metadata
    // on its controllers was a no-op. RequireVerifiedEmailGuard is intentionally
    // not wired here — separate task (writes lack @RequireVerifiedEmail today).
    { provide: APP_GUARD, useClass: RequireCapabilityGuard },
  ],
})
export class AppModule {}
