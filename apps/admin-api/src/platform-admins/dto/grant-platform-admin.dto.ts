import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/** Mirrors the Postgres `platform_admin_role` enum (migration 000018). */
export enum PlatformAdminRole {
  superadmin = 'superadmin',
  support = 'support',
  readonly = 'readonly',
}

/** Grant platform-admin privileges to an existing user (identified by user_id). */
export class GrantPlatformAdminDto {
  @ApiProperty({ description: 'User UUID to grant platform admin to' })
  @IsUUID()
  userId: string;

  @ApiProperty({
    enum: PlatformAdminRole,
    default: PlatformAdminRole.support,
    description: 'Platform role — only superadmin can grant superadmin',
  })
  @IsEnum(PlatformAdminRole)
  role: PlatformAdminRole = PlatformAdminRole.support;

  @ApiPropertyOptional({ description: 'Short human-readable justification for the grant' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  notes?: string;
}
