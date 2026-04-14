import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MembershipResponseDto {
  @ApiProperty({ description: 'Membership UUID' })
  id: string;

  @ApiProperty({ description: 'User UUID' })
  userId: string;

  @ApiProperty({ description: 'Tenant UUID' })
  tenantId: string;

  @ApiProperty({ description: 'Role' })
  role: string;

  @ApiPropertyOptional({ description: 'Invited by user UUID' })
  invitedBy: string | null;

  @ApiPropertyOptional({ description: 'Joined timestamp' })
  joinedAt: Date | null;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt: Date;
}

export class PaginatedMembershipsResponseDto {
  @ApiProperty({ type: [MembershipResponseDto] })
  data: MembershipResponseDto[];

  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() pageSize: number;
}
