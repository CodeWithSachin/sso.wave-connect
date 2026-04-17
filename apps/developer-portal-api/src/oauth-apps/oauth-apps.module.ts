import { Module } from '@nestjs/common';
import { OAuthAppsController } from './oauth-apps.controller';
import { OAuthAppsService } from './oauth-apps.service';

@Module({
  controllers: [OAuthAppsController],
  providers: [OAuthAppsService],
})
export class OAuthAppsModule {}
