import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { NatsService } from './nats.service';
import { SessionController } from './session.controller';
import { SessionService } from './session.service';

/**
 * Session shell module. Exposes:
 *   - GET /api/v1/session/me (bootstrap payload for admin-console)
 *   - GET /api/v1/session/events (Phase 3 SSE stream pushing
 *     `invalidate` events when membership / platform-admin /
 *     identity-side state changes for the connected user)
 *
 * NatsService is the transport behind /events; it's exported so
 * controllers in other admin-api modules (memberships, platform-admins)
 * can publish invalidations without re-importing the nats client.
 */
@Module({
  imports: [PrismaModule],
  controllers: [SessionController],
  providers: [SessionService, NatsService],
  exports: [SessionService, NatsService],
})
export class SessionModule {}
