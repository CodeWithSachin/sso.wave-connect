import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';

export enum MembershipRole {
  owner = 'owner',
  admin = 'admin',
  member = 'member',
  billing_manager = 'billing_manager',
  readonly = 'readonly',
}

export class InviteMemberDto {
  @ApiProperty({ description: 'Email of the user to invite', example: 'jane@acme.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ enum: MembershipRole, default: MembershipRole.member })
  @IsOptional()
  @IsEnum(MembershipRole)
  role?: MembershipRole;
}
