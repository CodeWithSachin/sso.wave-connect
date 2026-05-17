import { ApiProperty } from '@nestjs/swagger';
import type { PlatformAdminRole } from '@sso-platform/shared-types';

/**
 * Returned from `GET /api/v1/platform/me`. Any authenticated user can call
 * this — non-platform-admins get `{ role: null, grantedAt: null }` rather
 * than a 403. Designed for cross-service callers (developer-portal-api)
 * that need to know whether the calling user holds any platform privileges
 * without taking a Prisma dependency on `platform_admins`.
 */
export class PlatformMeResponseDto {
  @ApiProperty({
    nullable: true,
    description:
      'The caller\'s active platform role, or null if they are not an ' +
      'active platform admin.',
    enum: ['superadmin', 'support', 'readonly'],
  })
  role!: PlatformAdminRole | null;

  @ApiProperty({
    nullable: true,
    description:
      'ISO-8601 timestamp the grant was issued, or null if the caller is ' +
      'not a platform admin.',
  })
  grantedAt!: string | null;
}
