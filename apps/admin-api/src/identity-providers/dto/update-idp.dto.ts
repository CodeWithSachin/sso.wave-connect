import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsObject,
  IsArray,
  IsInt,
  IsNotEmpty,
  Min,
  MaxLength,
} from 'class-validator';

export enum IdpStatus {
  active = 'active',
  inactive = 'inactive',
  pending_verification = 'pending_verification',
}

export class UpdateIdpDto {
  @ApiProperty({ description: 'Optimistic lock version' })
  @IsInt()
  @Min(1)
  version: number;

  @ApiPropertyOptional({ description: 'Display name' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ enum: IdpStatus })
  @IsOptional()
  @IsEnum(IdpStatus)
  status?: IdpStatus;

  @ApiPropertyOptional({ description: 'Domain hint' })
  @IsOptional()
  @IsString()
  domainHint?: string;

  // SAML fields
  @ApiPropertyOptional() @IsOptional() @IsString() samlEntityId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() samlSsoUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() samlSloUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() samlCertificate?: string;

  // OIDC fields
  @ApiPropertyOptional() @IsOptional() @IsString() oidcIssuer?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() oidcClientId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() oidcClientSecret?: string;
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true }) oidcScopes?: string[];

  // Common
  @ApiPropertyOptional() @IsOptional() @IsObject() attributeMapping?: Record<string, string>;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() jitProvisioning?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() autoSyncGroups?: boolean;
}
