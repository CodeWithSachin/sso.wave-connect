import { Module } from '@nestjs/common';
import { PlatformAdminsController } from './platform-admins.controller';
import { PlatformAdminsService } from './platform-admins.service';
import { PlatformMeController } from './platform-me.controller';

@Module({
  controllers: [PlatformAdminsController, PlatformMeController],
  providers: [PlatformAdminsService],
  exports: [PlatformAdminsService],
})
export class PlatformAdminsModule {}
