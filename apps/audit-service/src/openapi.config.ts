import { DocumentBuilder } from '@nestjs/swagger';

export function buildSwaggerConfig() {
  return new DocumentBuilder()
    .setTitle('SSO Audit Service')
    .setDescription('Read-only query API for immutable audit logs')
    .setVersion('2.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'PASETO' })
    .build();
}
