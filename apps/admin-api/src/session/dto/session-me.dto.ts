import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  Capability,
  MembershipRole,
  PlatformAdminRole,
  SessionMeDto as SessionMeDtoContract,
  TenantKind,
} from '@sso-platform/shared-types';

// The classes below describe the runtime Swagger shape. The TypeScript
// interface `SessionMeDto` lives in libs/shared-types and is the contract the
// frontend consumes. We assert the class conforms by typing the controller
// return value as the shared interface.

class SessionMeUserDto {
  @ApiProperty({ description: 'User UUID' })
  id!: string;

  @ApiProperty() email!: string;

  @ApiProperty() emailVerified!: boolean;

  @ApiPropertyOptional() displayName?: string;

  @ApiPropertyOptional() avatarUrl?: string;
}

class SessionMeSessionDto {
  @ApiProperty({ description: 'Session row UUID (sessions.id)' })
  id!: string;

  @ApiProperty({ description: 'ISO timestamp when the session expires' })
  expiresAt!: string;
}

class SessionMeActiveTenantDto {
  @ApiProperty({ description: 'Tenant UUID' }) id!: string;

  @ApiProperty() slug!: string;

  @ApiProperty() name!: string;

  @ApiProperty({ enum: ['personal', 'organization'] }) kind!: TenantKind;
}

class SessionMeMembershipClass {
  @ApiProperty() tenantId!: string;

  @ApiProperty() tenantSlug!: string;

  @ApiProperty() tenantName!: string;

  @ApiProperty({ enum: ['personal', 'organization'] }) tenantKind!: TenantKind;

  @ApiProperty({ enum: ['owner', 'admin', 'member', 'billing_manager', 'readonly'] })
  role!: MembershipRole;

  @ApiProperty({ description: 'True for the tenant matching sessions.tenant_id' })
  isActive!: boolean;
}

class SessionMePlatformClass {
  @ApiProperty({ enum: ['superadmin', 'support', 'readonly'] })
  role!: PlatformAdminRole;

  @ApiProperty() grantedAt!: string;
}

/**
 * Single payload admin-console fetches on boot. Stale after 30s — client
 * polls. Matches the `SessionMeDto` interface in @sso-platform/shared-types.
 */
export class SessionMeResponseDto {
  @ApiProperty({ type: SessionMeUserDto }) user!: SessionMeUserDto;

  @ApiProperty({ type: SessionMeSessionDto }) session!: SessionMeSessionDto;

  @ApiPropertyOptional({ type: SessionMeActiveTenantDto, nullable: true })
  activeTenant!: SessionMeActiveTenantDto | null;

  @ApiProperty({ type: [SessionMeMembershipClass] })
  memberships!: SessionMeMembershipClass[];

  @ApiPropertyOptional({ type: SessionMePlatformClass, nullable: true })
  platform!: SessionMePlatformClass | null;

  @ApiProperty({
    type: [String],
    description:
      'Pre-computed capability list. Frontend reads verbatim — no re-derivation. ' +
      'See apps/admin-api/src/session/capabilities.ts.',
  })
  capabilities!: Capability[];
}

// Static check: runtime DTO class is structurally assignable to the shared
// interface. Rely on a trivial value-level assertion that the compiler accepts.
// (If a field drifts, this file stops compiling.)
export const __contractCheck: SessionMeDtoContract = null as unknown as SessionMeResponseDto;
