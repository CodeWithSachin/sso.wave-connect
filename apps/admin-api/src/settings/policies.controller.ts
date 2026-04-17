import {
  Body,
  Controller,
  Get,
  Patch,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { TenantId } from '@sso-platform/nestjs-auth';
import { PoliciesService } from './policies.service';
import { UpdatePolicyDto } from './dto/update-policy.dto';
import { PolicyResponseDto } from './dto/policy-response.dto';

@ApiTags('settings')
@ApiBearerAuth()
@Controller('api/v1/settings')
export class PoliciesController {
  constructor(private readonly policiesService: PoliciesService) {}

  @Get('policies')
  @ApiOperation({ summary: 'Get tenant security policy' })
  @ApiOkResponse({ type: PolicyResponseDto })
  findOne(@TenantId() tenantId: string) {
    return this.policiesService.findOne(tenantId);
  }

  @Patch('policies')
  @ApiOperation({ summary: 'Update tenant security policy (optimistic locking)' })
  @ApiOkResponse({ type: PolicyResponseDto })
  @ApiConflictResponse({ description: 'Version conflict' })
  update(
    @TenantId() tenantId: string,
    @Body() dto: UpdatePolicyDto,
  ) {
    return this.policiesService.update(tenantId, dto);
  }
}
