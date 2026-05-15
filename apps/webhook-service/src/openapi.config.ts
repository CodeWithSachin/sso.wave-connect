import { DocumentBuilder } from '@nestjs/swagger';

export function buildSwaggerConfig() {
  return new DocumentBuilder()
    .setTitle('SSO Webhook Service')
    .setDescription('Webhook endpoint management and event delivery with retry logic')
    .setVersion('2.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'PASETO' })
    .build();
}
