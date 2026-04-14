import { ApiProperty } from '@nestjs/swagger';

export class PolicyResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() tenantId: string;
  @ApiProperty() passwordMinLength: number;
  @ApiProperty() passwordRequireUpper: boolean;
  @ApiProperty() passwordRequireLower: boolean;
  @ApiProperty() passwordRequireNumber: boolean;
  @ApiProperty() passwordRequireSymbol: boolean;
  @ApiProperty() passwordRequireMfa: boolean;
  @ApiProperty() allowedMfaMethods: string[];
  @ApiProperty() sessionMaxAgeHours: number;
  @ApiProperty() idleTimeoutMinutes: number;
  @ApiProperty() ipAllowlist: string[];
  @ApiProperty() allowedEmailDomains: string[];
  @ApiProperty() requireSso: boolean;
  @ApiProperty() maxSessionsPerUser: number;
  @ApiProperty() passwordHistoryCount: number;
  @ApiProperty() lockoutThreshold: number;
  @ApiProperty() lockoutDurationMin: number;
  @ApiProperty() version: number;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}
