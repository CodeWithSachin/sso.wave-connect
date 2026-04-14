import { Module } from '@nestjs/common';
import { PasetoGuard } from './paseto.guard.js';
import { RebacGuard } from './rebac.guard.js';

@Module({
  providers: [PasetoGuard, RebacGuard],
  exports: [PasetoGuard, RebacGuard],
})
export class AuthzModule {}
