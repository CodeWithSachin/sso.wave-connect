import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsInt,
  Min,
  Matches,
  IsObject,
  MaxLength,
} from 'class-validator';

export enum TenantPlan {
  free = 'free',
  starter = 'starter',
  pro = 'pro',
  enterprise = 'enterprise',
}

export enum DataResidency {
  us = 'us',
  eu = 'eu',
  ap = 'ap',
  global = 'global',
}

export class CreateTenantDto {
  @ApiProperty({ description: 'Tenant name', example: 'Acme Corp' })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({
    description: 'URL-safe slug (lowercase, alphanumeric, hyphens)',
    example: 'acme-corp',
  })
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase alphanumeric with hyphens only',
  })
  @MaxLength(100)
  slug: string;

  @ApiPropertyOptional({ description: 'Display name', example: 'Acme Corporation' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  displayName?: string;

  @ApiPropertyOptional({ description: 'Primary domain', example: 'acme.com' })
  @IsOptional()
  @IsString()
  domain?: string;

  @ApiPropertyOptional({ description: 'Logo URL' })
  @IsOptional()
  @IsString()
  logoUrl?: string;

  @ApiPropertyOptional({ description: 'Favicon URL' })
  @IsOptional()
  @IsString()
  faviconUrl?: string;

  @ApiProperty({
    enum: TenantPlan,
    default: TenantPlan.free,
    description: 'Subscription plan',
  })
  @IsEnum(TenantPlan)
  plan: TenantPlan = TenantPlan.free;

  @ApiPropertyOptional({ enum: DataResidency, description: 'Data residency region' })
  @IsOptional()
  @IsEnum(DataResidency)
  dataResidency?: DataResidency;

  @ApiPropertyOptional({ description: 'Settings JSON object' })
  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Metadata JSON object' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Maximum number of users', example: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxUsers?: number;

  @ApiPropertyOptional({ description: 'Maximum number of apps', example: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxApps?: number;

  @ApiPropertyOptional({ description: 'Whether the tenant is active', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
