import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TenantResponseDto {
  @ApiProperty({ description: 'Tenant UUID' })
  id: string;

  @ApiProperty({ description: 'Tenant name' })
  name: string;

  @ApiProperty({ description: 'URL-safe slug' })
  slug: string;

  @ApiPropertyOptional({ description: 'Display name' })
  displayName: string | null;

  @ApiPropertyOptional({ description: 'Primary domain' })
  domain: string | null;

  @ApiPropertyOptional({ description: 'Logo URL' })
  logoUrl: string | null;

  @ApiPropertyOptional({ description: 'Favicon URL' })
  faviconUrl: string | null;

  @ApiProperty({ description: 'Subscription plan' })
  plan: string;

  @ApiPropertyOptional({ description: 'Data residency region' })
  dataResidency: string | null;

  @ApiPropertyOptional({ description: 'Settings JSON' })
  settings: Record<string, unknown> | null;

  @ApiPropertyOptional({ description: 'Metadata JSON' })
  metadata: Record<string, unknown> | null;

  @ApiPropertyOptional({ description: 'Max users' })
  maxUsers: number | null;

  @ApiPropertyOptional({ description: 'Max apps' })
  maxApps: number | null;

  @ApiProperty({ description: 'Whether tenant is active' })
  isActive: boolean;

  @ApiProperty({ description: 'Optimistic lock version' })
  version: number;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt: Date;

  @ApiPropertyOptional({ description: 'Soft-delete timestamp' })
  deletedAt: Date | null;
}

export class PaginatedTenantsResponseDto {
  @ApiProperty({ type: [TenantResponseDto] })
  data: TenantResponseDto[];

  @ApiProperty({ description: 'Total number of tenants' })
  total: number;

  @ApiProperty({ description: 'Current page' })
  page: number;

  @ApiProperty({ description: 'Page size' })
  pageSize: number;
}
