import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, Min } from 'class-validator';
import { MembershipRole } from './invite-member.dto';

export class UpdateRoleDto {
  @ApiProperty({ enum: MembershipRole, description: 'New role' })
  @IsEnum(MembershipRole)
  role: MembershipRole;

  @ApiProperty({ description: 'Optimistic lock version (not on membership — use current known state)' })
  @IsInt()
  @Min(0)
  version: number;
}
