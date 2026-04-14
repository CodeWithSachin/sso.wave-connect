import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsObject,
  IsArray,
  MaxLength,
  IsUrl,
} from 'class-validator';
import { MembershipRole } from '../../memberships/dto/invite-member.dto';

export enum IdpType {
  saml = 'saml',
  oidc = 'oidc',
  social_google = 'social_google',
  social_github = 'social_github',
  social_microsoft = 'social_microsoft',
}

export class CreateSamlIdpDto {
  @ApiProperty({ description: 'Display name', example: 'Okta SAML' })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({ enum: ['saml'], default: 'saml' })
  type: 'saml' = 'saml';

  @ApiPropertyOptional({ description: 'Domain hint for auto-routing', example: 'acme.com' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  domainHint?: string;

  @ApiProperty({ description: 'SAML Entity ID' })
  @IsString()
  samlEntityId: string;

  @ApiProperty({ description: 'SAML SSO URL' })
  @IsUrl()
  samlSsoUrl: string;

  @ApiPropertyOptional({ description: 'SAML SLO URL' })
  @IsOptional()
  @IsUrl()
  samlSloUrl?: string;

  @ApiProperty({ description: 'Base64-encoded X.509 certificate' })
  @IsString()
  samlCertificate: string;

  @ApiPropertyOptional({ description: 'Signing algorithm', default: 'RSA-SHA256' })
  @IsOptional()
  @IsString()
  samlSigningAlgorithm?: string;

  @ApiPropertyOptional({ description: 'NameID format' })
  @IsOptional()
  @IsString()
  samlNameIdFormat?: string;

  @ApiPropertyOptional({ description: 'Attribute mapping JSON' })
  @IsOptional()
  @IsObject()
  attributeMapping?: Record<string, string>;

  @ApiPropertyOptional({ description: 'Enable JIT provisioning', default: true })
  @IsOptional()
  @IsBoolean()
  jitProvisioning?: boolean;

  @ApiPropertyOptional({ enum: MembershipRole, default: MembershipRole.member })
  @IsOptional()
  @IsEnum(MembershipRole)
  defaultRole?: MembershipRole;
}

export class CreateOidcIdpDto {
  @ApiProperty({ description: 'Display name', example: 'Azure AD OIDC' })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({ enum: ['oidc'], default: 'oidc' })
  type: 'oidc' = 'oidc';

  @ApiPropertyOptional({ description: 'Domain hint', example: 'acme.com' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  domainHint?: string;

  @ApiProperty({ description: 'OIDC Issuer URL' })
  @IsUrl()
  oidcIssuer: string;

  @ApiProperty({ description: 'Client ID' })
  @IsString()
  @MaxLength(255)
  oidcClientId: string;

  @ApiProperty({ description: 'Client secret (will be encrypted at rest)' })
  @IsString()
  oidcClientSecret: string;

  @ApiPropertyOptional({ description: 'Discovery URL (defaults to issuer + .well-known)' })
  @IsOptional()
  @IsUrl()
  oidcDiscoveryUrl?: string;

  @ApiPropertyOptional({ description: 'Scopes', default: ['openid', 'profile', 'email'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  oidcScopes?: string[];

  @ApiPropertyOptional({ description: 'Attribute mapping JSON' })
  @IsOptional()
  @IsObject()
  attributeMapping?: Record<string, string>;

  @ApiPropertyOptional({ description: 'Enable JIT provisioning', default: true })
  @IsOptional()
  @IsBoolean()
  jitProvisioning?: boolean;

  @ApiPropertyOptional({ enum: MembershipRole, default: MembershipRole.member })
  @IsOptional()
  @IsEnum(MembershipRole)
  defaultRole?: MembershipRole;
}
