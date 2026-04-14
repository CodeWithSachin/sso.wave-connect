import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsObject,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateGroupDto {
  @ApiProperty({ description: 'Group name', example: 'Engineering' })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({ description: 'URL-safe slug', example: 'engineering' })
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase alphanumeric with hyphens',
  })
  @MaxLength(255)
  slug: string;

  @ApiPropertyOptional({ description: 'Description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Whether managed by external directory', default: false })
  @IsOptional()
  @IsBoolean()
  isManaged?: boolean;

  @ApiPropertyOptional({ description: 'Metadata JSON' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
