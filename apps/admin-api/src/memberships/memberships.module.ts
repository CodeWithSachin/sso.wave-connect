import { Module } from '@nestjs/common';
import { SessionModule } from '../session/session.module';
import { MembershipsController } from './memberships.controller';
import { MembershipsService } from './memberships.service';

@Module({
  // SessionModule exports NatsService — MembershipsService publishes
  // session.invalidate on role change / removal (Phase 3).
  imports: [SessionModule],
  controllers: [MembershipsController],
  providers: [MembershipsService],
  exports: [MembershipsService],
})
export class MembershipsModule {}
