import { Module } from '@nestjs/common';
import { MyTenantController } from './my-tenant.controller';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';

@Module({
  controllers: [TenantsController, MyTenantController],
  providers: [TenantsService],
  exports: [TenantsService],
})
export class TenantsModule {}
