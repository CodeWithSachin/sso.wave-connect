import { IsBoolean, IsEmail, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// --- SCIM Schema Constants ---
export const SCIM_USER_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:User';
export const SCIM_LIST_SCHEMA =
  'urn:ietf:params:scim:api:messages:2.0:ListResponse';
export const SCIM_ERROR_SCHEMA =
  'urn:ietf:params:scim:api:messages:2.0:Error';

// --- SCIM User Resource ---
export interface ScimEmail {
  value: string;
  type?: string;
  primary?: boolean;
}

export interface ScimName {
  givenName?: string;
  familyName?: string;
  formatted?: string;
}

export class CreateScimUserDto {
  @ApiProperty()
  @IsString()
  userName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  name?: ScimName;

  @ApiPropertyOptional()
  @IsOptional()
  emails?: ScimEmail[];

  @ApiProperty()
  @IsString()
  displayName!: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  active?: boolean;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  externalId?: string;
}

export class ReplaceScimUserDto extends CreateScimUserDto {}

export interface ScimUserResource {
  schemas: string[];
  id: string;
  externalId?: string;
  userName: string;
  name?: ScimName;
  displayName: string;
  emails?: ScimEmail[];
  active: boolean;
  meta: {
    resourceType: string;
    created: string;
    lastModified: string;
    location: string;
  };
}

export interface ScimListResponse<T> {
  schemas: string[];
  totalResults: number;
  startIndex: number;
  itemsPerPage: number;
  Resources: T[];
}

export interface ScimErrorResponse {
  schemas: string[];
  status: string;
  scimType?: string;
  detail: string;
}
