import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CryptoService } from './crypto.service';

export interface DispatchRequest {
  tenantId: string;
  eventType: string;
  data: Record<string, unknown>;
}

@Injectable()
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async dispatch(req: DispatchRequest): Promise<number> {
    // Find all active endpoints for this tenant + event type
    const endpoints = await this.prisma.$queryRaw<
      { id: string; url: string; secret: string; event_types: string[] }[]
    >`
      SELECT id, url, secret, event_types
      FROM webhook_endpoints
      WHERE tenant_id = ${req.tenantId}::uuid
        AND is_active = true
        AND disabled_at IS NULL
        AND (event_types @> ARRAY[${req.eventType}]::text[] OR '*' = ANY(event_types))
    `;

    if (!endpoints.length) return 0;

    const now = new Date();

    for (const endpoint of endpoints) {
      const deliveryId = randomUUID();
      const payload = JSON.stringify({
        id: deliveryId,
        type: req.eventType,
        timestamp: now.toISOString(),
        tenant_id: req.tenantId,
        data: req.data,
      });

      const signature = this.crypto.sign(payload, endpoint.secret);

      await this.prisma.$executeRaw`
        INSERT INTO webhook_deliveries
          (id, endpoint_id, event_type, payload, signature, status, attempt, max_retries, created_at)
        VALUES (
          ${deliveryId}::uuid,
          ${endpoint.id}::uuid,
          ${req.eventType},
          ${payload}::jsonb,
          ${signature},
          'pending',
          0,
          5,
          ${now}
        )
      `;
    }

    this.logger.log(
      `Dispatched ${req.eventType} to ${endpoints.length} endpoint(s) for tenant ${req.tenantId}`,
    );

    return endpoints.length;
  }
}
