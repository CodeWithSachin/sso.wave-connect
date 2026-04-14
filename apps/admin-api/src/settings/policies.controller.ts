import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { PoliciesService } from './policies.service';
import { UpdatePolicyDto } from './dto/update-policy.dto';
import { PolicyResponseDto } from './dto/policy-response.dto';

@ApiTags('settings')
@ApiBearerAuth()
@Controller('api/v1/tenants/:tenantId/settings')
export class PoliciesController {
  constructor(private readonly policiesService: PoliciesService) {}

  @Get('policies')
  @ApiOperation({ summary: 'Get tenant security policy' })
  @ApiOkResponse({ type: PolicyResponseDto })
  findOne(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    return this.policiesService.findOne(tenantId);
  }

  @Patch('policies')
  @ApiOperation({ summary: 'Update tenant security policy (optimistic locking)' })
  @ApiOkResponse({ type: PolicyResponseDto })
  @ApiConflictResponse({ description: 'Version conflict' })
  update(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() dto: UpdatePolicyDto,
  ) {
    return this.policiesService.update(tenantId, dto);
  }
}
