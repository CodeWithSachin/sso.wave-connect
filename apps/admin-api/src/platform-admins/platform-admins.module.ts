import { Module } from '@nestjs/common';
import { SessionModule } from '../session/session.module';
import { PlatformAdminsController } from './platform-admins.controller';
import { PlatformAdminsService } from './platform-admins.service';
import { PlatformMeController } from './platform-me.controller';

@Module({
  // SessionModule exports NatsService — PlatformAdminsService publishes
  // session.invalidate on grant + revoke (Phase 3 push channel).
  imports: [SessionModule],
  controllers: [PlatformAdminsController, PlatformMeController],
  providers: [PlatformAdminsService],
  exports: [PlatformAdminsService],
})
export class PlatformAdminsModule {}
