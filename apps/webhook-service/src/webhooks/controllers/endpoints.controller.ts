import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { randomUUID, createHash } from 'crypto';
import { RequireCapability, TenantId } from '@sso-platform/nestjs-auth';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CryptoService } from '../services/crypto.service';

interface WebhookEndpointRow {
  id: string;
  tenant_id: string;
  url: string;
  description: string | null;
  subscribed_events: string[];
  is_active: boolean;
  failure_count: number;
  disabled_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

@ApiTags('Webhook Endpoints')
@Controller('api/v1/webhooks')
export class EndpointsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  @Get()
  @RequireCapability('read_webhooks')
  async list(
    @TenantId() tenantId: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    const offset = (parseInt(page, 10) - 1) * parseInt(pageSize, 10);
    const limit = parseInt(pageSize, 10);

    const endpoints = await this.prisma.$queryRaw<WebhookEndpointRow[]>`
      SELECT id, tenant_id, url, description, subscribed_events, is_active,
             failure_count, disabled_at, created_at, updated_at
      FROM webhook_endpoints
      WHERE tenant_id = ${tenantId}::uuid
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const totalResult = await this.prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM webhook_endpoints WHERE tenant_id = ${tenantId}::uuid
    `;

    return {
      data: endpoints,
      total: Number(totalResult[0]?.count ?? 0),
      page: parseInt(page, 10),
      pageSize: limit,
    };
  }

  @Post()
  @RequireCapability('manage_webhooks')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @TenantId() tenantId: string,
    @Body() body: { url: string; description?: string; subscribedEvents: string[] },
  ) {
    const id = randomUUID();
    const secret = this.crypto.generateSecret();
    const secretHash = createHash('sha256').update(secret).digest('hex');
    const now = new Date();

    await this.prisma.$executeRaw`
      INSERT INTO webhook_endpoints (id, tenant_id, url, description, secret_hash, secret_encrypted, subscribed_events, is_active, created_at, updated_at)
      VALUES (
        ${id}::uuid, ${tenantId}::uuid, ${body.url}, ${body.description ?? null},
        ${secretHash}, ${secret}, ${body.subscribedEvents}::text[], true, ${now}, ${now}
      )
    `;

    return {
      id,
      url: body.url,
      description: body.description,
      subscribedEvents: body.subscribedEvents,
      secret,
      isActive: true,
      createdAt: now,
    };
  }

  @Delete(':id')
  @RequireCapability('manage_webhooks')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.prisma.$executeRaw`
      DELETE FROM webhook_endpoints
      WHERE id = ${id}::uuid AND tenant_id = ${tenantId}::uuid
    `;
  }
}
