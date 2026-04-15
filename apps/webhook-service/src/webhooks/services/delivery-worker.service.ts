import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';

interface PendingDelivery {
  id: string;
  endpoint_id: string;
  url: string;
  payload: string;
  signature: string;
  attempt: number;
  max_retries: number;
  secret: string;
}

@Injectable()
export class DeliveryWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DeliveryWorkerService.name);
  private intervalRef: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.logger.log('Delivery worker started — polling every 5s');
    this.intervalRef = setInterval(() => this.processPending(), 5000);
  }

  onModuleDestroy() {
    if (this.intervalRef) clearInterval(this.intervalRef);
  }

  private async processPending(): Promise<void> {
    try {
      // Fetch pending deliveries ready for attempt
      const deliveries = await this.prisma.$queryRaw<PendingDelivery[]>`
        SELECT d.id, d.endpoint_id, e.url, d.payload::text, d.signature, d.attempt, d.max_retries, e.secret
        FROM webhook_deliveries d
        JOIN webhook_endpoints e ON e.id = d.endpoint_id
        WHERE d.status IN ('pending', 'retrying')
          AND (d.next_retry_at IS NULL OR d.next_retry_at <= NOW())
        ORDER BY d.created_at ASC
        LIMIT 10
      `;

      for (const delivery of deliveries) {
        await this.attemptDelivery(delivery);
      }
    } catch (err) {
      this.logger.error('Delivery worker error', (err as Error).stack);
    }
  }

  private async attemptDelivery(delivery: PendingDelivery): Promise<void> {
    const newAttempt = delivery.attempt + 1;

    try {
      const response = await fetch(delivery.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': delivery.signature,
          'X-Webhook-ID': delivery.id,
        },
        body: delivery.payload,
        signal: AbortSignal.timeout(10000), // 10s timeout
      });

      if (response.ok) {
        await this.prisma.$executeRaw`
          UPDATE webhook_deliveries
          SET status = 'delivered', attempt = ${newAttempt}, delivered_at = NOW(), response_status = ${response.status}
          WHERE id = ${delivery.id}::uuid
        `;

        // Reset failure count on the endpoint
        await this.prisma.$executeRaw`
          UPDATE webhook_endpoints SET failure_count = 0 WHERE id = ${delivery.endpoint_id}::uuid
        `;

        this.logger.debug(`Delivered webhook ${delivery.id}`);
      } else {
        await this.handleFailure(delivery, newAttempt, response.status);
      }
    } catch (err) {
      await this.handleFailure(delivery, newAttempt, 0);
      this.logger.warn(
        `Webhook delivery ${delivery.id} failed: ${(err as Error).message}`,
      );
    }
  }

  private async handleFailure(
    delivery: PendingDelivery,
    attempt: number,
    responseStatus: number,
  ): Promise<void> {
    if (attempt >= delivery.max_retries) {
      // Max retries reached — mark failed
      await this.prisma.$executeRaw`
        UPDATE webhook_deliveries
        SET status = 'failed', attempt = ${attempt}, response_status = ${responseStatus}
        WHERE id = ${delivery.id}::uuid
      `;

      // Increment failure count, auto-disable after 10 consecutive
      await this.prisma.$executeRaw`
        UPDATE webhook_endpoints
        SET failure_count = failure_count + 1,
            disabled_at = CASE WHEN failure_count + 1 >= 10 THEN NOW() ELSE disabled_at END
        WHERE id = ${delivery.endpoint_id}::uuid
      `;

      this.logger.warn(
        `Webhook delivery ${delivery.id} permanently failed after ${attempt} attempts`,
      );
    } else {
      // Exponential backoff: min(2^attempt * 10s, 1 hour)
      const backoffSeconds = Math.min(Math.pow(2, attempt) * 10, 3600);

      await this.prisma.$executeRaw`
        UPDATE webhook_deliveries
        SET status = 'retrying',
            attempt = ${attempt},
            response_status = ${responseStatus},
            next_retry_at = NOW() + INTERVAL '1 second' * ${backoffSeconds}
        WHERE id = ${delivery.id}::uuid
      `;
    }
  }
}
