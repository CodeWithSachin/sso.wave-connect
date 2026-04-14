import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class IdpResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() tenantId: string;
  @ApiProperty() name: string;
  @ApiProperty() type: string;
  @ApiProperty() status: string;
  @ApiPropertyOptional() domainHint: string | null;
  @ApiPropertyOptional() samlEntityId: string | null;
  @ApiPropertyOptional() samlSsoUrl: string | null;
  @ApiPropertyOptional() oidcIssuer: string | null;
  @ApiPropertyOptional() oidcClientId: string | null;
  @ApiProperty() jitProvisioning: boolean;
  @ApiProperty() autoSyncGroups: boolean;
  @ApiProperty() defaultRole: string;
  @ApiProperty() version: number;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class PaginatedIdpsResponseDto {
  @ApiProperty({ type: [IdpResponseDto] }) data: IdpResponseDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() pageSize: number;
}
