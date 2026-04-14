import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UserResponseDto {
  @ApiProperty({ description: 'User UUID' })
  id: string;

  @ApiProperty({ description: 'Email address' })
  email: string;

  @ApiProperty({ description: 'Email verified' })
  emailVerified: boolean;

  @ApiPropertyOptional({ description: 'Display name' })
  displayName: string | null;

  @ApiPropertyOptional({ description: 'First name' })
  firstName: string | null;

  @ApiPropertyOptional({ description: 'Last name' })
  lastName: string | null;

  @ApiPropertyOptional({ description: 'Avatar URL' })
  avatarUrl: string | null;

  @ApiPropertyOptional({ description: 'Phone number' })
  phoneNumber: string | null;

  @ApiProperty({ description: 'Locale' })
  locale: string | null;

  @ApiProperty({ description: 'Timezone' })
  timezone: string | null;

  @ApiProperty({ description: 'User status' })
  status: string;

  @ApiPropertyOptional({ description: 'Last login timestamp' })
  lastLoginAt: Date | null;

  @ApiProperty({ description: 'Optimistic lock version' })
  version: number;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt: Date;
}

export class PaginatedUsersResponseDto {
  @ApiProperty({ type: [UserResponseDto] })
  data: UserResponseDto[];

  @ApiProperty({ description: 'Total count' })
  total: number;

  @ApiProperty({ description: 'Current page' })
  page: number;

  @ApiProperty({ description: 'Page size' })
  pageSize: number;
}
