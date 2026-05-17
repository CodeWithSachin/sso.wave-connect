import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequireCapability } from '@sso-platform/nestjs-auth';
import { PrismaService } from '../../shared/prisma/prisma.service';

@ApiTags('Webhook Deliveries')
@Controller('api/v1/webhooks/:endpointId/deliveries')
export class DeliveriesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequireCapability('read_webhooks')
  async list(
    @Param('endpointId', ParseUUIDPipe) endpointId: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    const offset = (parseInt(page, 10) - 1) * parseInt(pageSize, 10);
    const limit = parseInt(pageSize, 10);

    const deliveries = await this.prisma.$queryRaw`
      SELECT id, event_type, status, attempt, response_status,
             delivered_at, next_retry_at, created_at
      FROM webhook_deliveries
      WHERE endpoint_id = ${endpointId}::uuid
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    return { data: deliveries, page: parseInt(page, 10), pageSize: limit };
  }

  @Get(':deliveryId')
  @RequireCapability('read_webhooks')
  async getDetail(
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
  ) {
    const rows = await this.prisma.$queryRaw`
      SELECT id, endpoint_id, event_type, payload, signature, status,
             attempt, max_retries, response_status, delivered_at, next_retry_at, created_at
      FROM webhook_deliveries
      WHERE id = ${deliveryId}::uuid
      LIMIT 1
    `;
    return (rows as unknown[])[0] ?? null;
  }

  @Post(':deliveryId/retry')
  @RequireCapability('manage_webhooks')
  async retry(
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
  ) {
    await this.prisma.$executeRaw`
      UPDATE webhook_deliveries
      SET status = 'pending', next_retry_at = NULL
      WHERE id = ${deliveryId}::uuid AND status = 'failed'
    `;
    return { status: 'queued_for_retry' };
  }
}
