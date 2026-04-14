import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class UpdatePolicyDto {
  @ApiProperty({ description: 'Optimistic lock version' })
  @IsInt()
  @Min(1)
  version: number;

  @ApiPropertyOptional({ description: 'Minimum password length', example: 12 })
  @IsOptional()
  @IsInt()
  @Min(8)
  @Max(128)
  passwordMinLength?: number;

  @ApiPropertyOptional({ description: 'Require uppercase letters' })
  @IsOptional()
  @IsBoolean()
  passwordRequireUpper?: boolean;

  @ApiPropertyOptional({ description: 'Require lowercase letters' })
  @IsOptional()
  @IsBoolean()
  passwordRequireLower?: boolean;

  @ApiPropertyOptional({ description: 'Require numbers' })
  @IsOptional()
  @IsBoolean()
  passwordRequireNumber?: boolean;

  @ApiPropertyOptional({ description: 'Require symbols' })
  @IsOptional()
  @IsBoolean()
  passwordRequireSymbol?: boolean;

  @ApiPropertyOptional({ description: 'Require MFA for all users' })
  @IsOptional()
  @IsBoolean()
  passwordRequireMfa?: boolean;

  @ApiPropertyOptional({ description: 'Allowed MFA methods', example: ['totp', 'webauthn'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedMfaMethods?: string[];

  @ApiPropertyOptional({ description: 'Max session age in hours', example: 24 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  sessionMaxAgeHours?: number;

  @ApiPropertyOptional({ description: 'Idle timeout in minutes', example: 30 })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(1440)
  idleTimeoutMinutes?: number;

  @ApiPropertyOptional({ description: 'IP allowlist (CIDR notation)', example: ['10.0.0.0/8'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ipAllowlist?: string[];

  @ApiPropertyOptional({ description: 'Allowed email domains', example: ['acme.com'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedEmailDomains?: string[];

  @ApiPropertyOptional({ description: 'Require SSO for login' })
  @IsOptional()
  @IsBoolean()
  requireSso?: boolean;

  @ApiPropertyOptional({ description: 'Max concurrent sessions per user', example: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxSessionsPerUser?: number;

  @ApiPropertyOptional({ description: 'Password history count (prevent reuse)', example: 5 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(24)
  passwordHistoryCount?: number;

  @ApiPropertyOptional({ description: 'Failed login lockout threshold', example: 5 })
  @IsOptional()
  @IsInt()
  @Min(3)
  @Max(20)
  lockoutThreshold?: number;

  @ApiPropertyOptional({ description: 'Lockout duration in minutes', example: 15 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  lockoutDurationMin?: number;
}
