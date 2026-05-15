import { DocumentBuilder } from '@nestjs/swagger';

export function buildSwaggerConfig() {
  return new DocumentBuilder()
    .setTitle('SSO Directory Service')
    .setDescription(
      'SCIM 2.0 provisioning API — enterprise user and group sync from IdPs (Okta, Azure AD, etc.)',
    )
    .setVersion('2.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'SCIM' })
    .build();
}
