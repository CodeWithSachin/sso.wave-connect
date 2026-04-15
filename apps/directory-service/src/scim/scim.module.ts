import { Module } from '@nestjs/common';
import { ScimUsersController } from './controllers/scim-users.controller';
import { ScimGroupsController } from './controllers/scim-groups.controller';
import { ScimService } from './services/scim.service';
import { ScimAuthGuard } from './guards/scim-auth.guard';

@Module({
  controllers: [ScimUsersController, ScimGroupsController],
  providers: [ScimService, ScimAuthGuard],
})
export class ScimModule {}
