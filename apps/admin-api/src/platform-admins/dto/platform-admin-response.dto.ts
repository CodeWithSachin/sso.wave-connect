import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PlatformAdminResponseDto {
  @ApiProperty({ description: 'User UUID' })
  userId: string;

  @ApiProperty({ description: 'User email (denormalized from users table)' })
  email: string;

  @ApiProperty({ description: 'Platform role' })
  role: string;

  @ApiProperty({ description: 'When the grant was made' })
  grantedAt: Date;

  @ApiPropertyOptional({ description: 'User UUID that created the grant' })
  grantedBy: string | null;

  @ApiPropertyOptional({ description: 'Timestamp of revocation (null if still active)' })
  revokedAt: Date | null;

  @ApiPropertyOptional({ description: 'Optional justification' })
  notes: string | null;
}

export class PlatformAdminListResponseDto {
  @ApiProperty({ type: [PlatformAdminResponseDto] })
  data: PlatformAdminResponseDto[];

  @ApiProperty({ description: 'Total active platform admins' })
  total: number;
}
