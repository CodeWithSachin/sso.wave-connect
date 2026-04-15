import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { ScimModule } from '../scim/scim.module';

@Module({
  imports: [PrismaModule, ScimModule],
})
export class AppModule {}
