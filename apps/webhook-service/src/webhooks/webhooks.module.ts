import { Module } from '@nestjs/common';
import { EndpointsController } from './controllers/endpoints.controller';
import { DeliveriesController } from './controllers/deliveries.controller';
import { InternalDispatchController } from './controllers/internal-dispatch.controller';
import { DispatchService } from './services/dispatch.service';
import { DeliveryWorkerService } from './services/delivery-worker.service';
import { CryptoService } from './services/crypto.service';

@Module({
  controllers: [
    EndpointsController,
    DeliveriesController,
    InternalDispatchController,
  ],
  providers: [DispatchService, DeliveryWorkerService, CryptoService],
})
export class WebhooksModule {}
