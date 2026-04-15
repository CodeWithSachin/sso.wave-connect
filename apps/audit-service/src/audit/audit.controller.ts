import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuditService } from './audit.service';

@ApiTags('Audit Logs')
@Controller('api/v1/tenants/:tenantId/audit-logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  async query(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '50',
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('actorId') actorId?: string,
    @Query('action') action?: string,
    @Query('resourceType') resourceType?: string,
    @Query('resourceId') resourceId?: string,
  ) {
    return this.auditService.query({
      tenantId,
      page: parseInt(page, 10),
      pageSize: parseInt(pageSize, 10),
      startDate,
      endDate,
      actorId,
      action,
      resourceType,
      resourceId,
    });
  }
}
