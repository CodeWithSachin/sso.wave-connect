import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsUUID } from 'class-validator';

export class AddGroupMemberDto {
  @ApiProperty({ description: 'User UUID to add' })
  @IsUUID()
  userId: string;

  @ApiPropertyOptional({ description: 'Role within the group', default: 'member' })
  @IsOptional()
  @IsString()
  role?: string;
}
