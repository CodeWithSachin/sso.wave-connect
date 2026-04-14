import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class NestGroupDto {
  @ApiProperty({ description: 'Child group UUID to nest under this group' })
  @IsUUID()
  childGroupId: string;
}
