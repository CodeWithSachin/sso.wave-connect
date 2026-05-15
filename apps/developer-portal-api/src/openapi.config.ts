import { DocumentBuilder } from '@nestjs/swagger';

export function buildSwaggerConfig() {
  return new DocumentBuilder()
    .setTitle('SSO Developer Portal API')
    .setDescription(
      'API key management, OAuth app registration, SDK documentation, and SCIM token management',
    )
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'PASETO' })
    .build();
}
