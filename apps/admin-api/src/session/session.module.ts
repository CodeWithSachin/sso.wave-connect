import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { SessionController } from './session.controller';
import { SessionService } from './session.service';

/**
 * Phase 1 module — exposes GET /api/v1/session/me, the single bootstrap
 * payload admin-console fetches to populate its SessionStore.
 *
 * No new DB migrations; reads existing users + platform_admins + sessions
 * tables via Prisma and forwards the sso_session cookie to identity-service
 * for membership composition.
 */
@Module({
  imports: [PrismaModule],
  controllers: [SessionController],
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}
