import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GroupResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() tenantId: string;
  @ApiProperty() name: string;
  @ApiProperty() slug: string;
  @ApiPropertyOptional() description: string | null;
  @ApiProperty() isManaged: boolean;
  @ApiPropertyOptional() source: string | null;
  @ApiPropertyOptional() externalId: string | null;
  @ApiProperty() version: number;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class PaginatedGroupsResponseDto {
  @ApiProperty({ type: [GroupResponseDto] }) data: GroupResponseDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() pageSize: number;
}
