import { Module } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { SessionController } from './session.controller';
import { SessionService } from './session.service';

/**
 * Wires `GET /api/v1/session/me` for the developer-portal shell. The
 * SessionService composes the response from three sources:
 *   - identity-service `/auth/session/memberships` (HTTP)
 *   - admin-api `/api/v1/platform/me` (HTTP, post ADR-0002 architecture
 *     review — replaces the previous raw-SQL read across the shared DB)
 *   - shared sso_dev DB for `users` + `sessions` via raw SQL (still
 *     justified because neither table has a single owning service yet).
 */
@Module({
  controllers: [SessionController],
  providers: [SessionService, PrismaService],
  exports: [SessionService],
})
export class SessionModule {}
