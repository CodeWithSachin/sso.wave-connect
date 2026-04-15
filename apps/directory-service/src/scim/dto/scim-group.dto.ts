import { IsArray, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const SCIM_GROUP_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:Group';

export interface ScimGroupMember {
  value: string;
  display?: string;
  type?: string;
}

export class CreateScimGroupDto {
  @ApiProperty()
  @IsString()
  displayName!: string;

  @ApiPropertyOptional()
  @IsArray()
  @IsOptional()
  members?: ScimGroupMember[];

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  externalId?: string;
}

export interface ScimPatchOperation {
  op: 'add' | 'remove' | 'replace';
  path?: string;
  value?: unknown;
}

export class ScimPatchRequest {
  schemas!: string[];
  Operations!: ScimPatchOperation[];
}

export interface ScimGroupResource {
  schemas: string[];
  id: string;
  externalId?: string;
  displayName: string;
  members: ScimGroupMember[];
  meta: {
    resourceType: string;
    created: string;
    lastModified: string;
    location: string;
  };
}
