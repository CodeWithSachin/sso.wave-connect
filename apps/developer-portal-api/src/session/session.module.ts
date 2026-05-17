import { Module } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { NatsService } from './nats.service';
import { SessionController } from './session.controller';
import { SessionService } from './session.service';

/**
 * Wires:
 *   - GET /api/v1/session/me — developer-portal bootstrap
 *   - GET /api/v1/session/events — Phase 3 SSE push channel
 *
 * SessionService composes the /me response from identity-service +
 * admin-api + the shared sso_dev DB. NatsService is subscribe-only
 * here (no developer-portal-api mutations touch session-relevant
 * state today).
 */
@Module({
  controllers: [SessionController],
  providers: [SessionService, PrismaService, NatsService],
  exports: [SessionService],
})
export class SessionModule {}
