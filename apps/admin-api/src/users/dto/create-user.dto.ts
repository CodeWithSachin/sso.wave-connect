import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEmail,
  IsEnum,
  IsBoolean,
  MaxLength,
  MinLength,
} from 'class-validator';

export enum UserStatus {
  active = 'active',
  inactive = 'inactive',
  suspended = 'suspended',
  pending = 'pending',
}

export class CreateUserDto {
  @ApiProperty({ description: 'Email address', example: 'jane@acme.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ description: 'Initial password (min 8 chars)' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @ApiPropertyOptional({ description: 'Display name', example: 'Jane Doe' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  displayName?: string;

  @ApiPropertyOptional({ description: 'First name', example: 'Jane' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional({ description: 'Last name', example: 'Doe' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional({ description: 'Phone number', example: '+1234567890' })
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @ApiPropertyOptional({ description: 'Locale', example: 'en', default: 'en' })
  @IsOptional()
  @IsString()
  locale?: string;

  @ApiPropertyOptional({ description: 'Timezone', example: 'UTC', default: 'UTC' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ enum: UserStatus, default: UserStatus.pending })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional({ description: 'Mark email as verified', default: false })
  @IsOptional()
  @IsBoolean()
  emailVerified?: boolean;
}
