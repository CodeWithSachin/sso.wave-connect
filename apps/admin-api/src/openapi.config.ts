import { DocumentBuilder } from '@nestjs/swagger';

// Shared builder consumed by both `main.ts` (runtime /reference + /openapi.json)
// and `scripts/export-openapi.ts` (CI export to docs/api/admin-api/). Editing
// title / description / version in one place keeps both in sync.
export function buildSwaggerConfig() {
  return new DocumentBuilder()
    .setTitle('SSO Admin API')
    .setDescription(
      'Admin API for the SSO platform — tenant management, users, memberships, groups, identity providers, and security policies',
    )
    .setVersion('2.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'PASETO' })
    .build();
}
