import { PartialType } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CreateTenantDto } from './create-tenant.dto';

export class UpdateTenantDto extends PartialType(CreateTenantDto) {
  @ApiProperty({
    description: 'Current version for optimistic locking (required)',
    example: 1,
  })
  @IsInt()
  @Min(1)
  version: number;
}
