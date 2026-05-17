import {
  Body,
  Controller,
  Get,
  Patch,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser, RequireCapability, RequireVerifiedEmail, TenantId, type AuthSession } from '@sso-platform/nestjs-auth';
import { PoliciesService } from './policies.service';
import { UpdatePolicyDto } from './dto/update-policy.dto';
import { PolicyResponseDto } from './dto/policy-response.dto';

@ApiTags('settings')
@ApiBearerAuth()
@Controller('api/v1/settings')
export class PoliciesController {
  constructor(private readonly policiesService: PoliciesService) {}

  @Get('policies')
  @RequireCapability('view_tenant_settings')
  @ApiOperation({ summary: 'Get tenant security policy' })
  @ApiOkResponse({ type: PolicyResponseDto })
  findOne(@TenantId() tenantId: string) {
    return this.policiesService.findOne(tenantId);
  }

  @Patch('policies')
  @RequireCapability('manage_members')
  @RequireVerifiedEmail()
  @ApiOperation({ summary: 'Update tenant security policy (optimistic locking)' })
  @ApiOkResponse({ type: PolicyResponseDto })
  @ApiConflictResponse({ description: 'Version conflict' })
  @ApiForbiddenResponse({ description: 'Caller is not a tenant owner or admin' })
  update(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthSession,
    @Req() req: Request,
    @Body() dto: UpdatePolicyDto,
  ) {
    return this.policiesService.update(tenantId, dto, user.id, {
      ip: extractClientIp(req),
      userAgent: req.headers['user-agent'] ?? null,
    });
  }
}

/**
 * Prefer the proxy-supplied X-Forwarded-For chain when present (admin-api is
 * fronted by an ingress that sets it); fall back to req.ip for direct dev
 * access. Take the left-most address — that's the original client per the
 * X-Forwarded-For spec; right-most entries are upstream proxies.
 */
function extractClientIp(req: Request): string | null {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.ip ?? null;
}
