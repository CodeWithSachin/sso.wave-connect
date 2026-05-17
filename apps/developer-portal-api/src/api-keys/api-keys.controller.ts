import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import {
  CurrentUser,
  RequireCapability,
  RequireVerifiedEmail,
  TenantId,
  type AuthSession,
} from '@sso-platform/nestjs-auth';
import { ApiKeysService } from './api-keys.service';

/**
 * API key management. Capability gates (ADR-0002 + Item 1.2 split):
 *   - Reads (`list`, `get`, `usage`): `read_api_keys` (any active membership).
 *   - Writes (`create`, `delete`): `manage_api_keys` (owner / admin / member).
 *
 * `readonly` and `billing_manager` callers can still browse keys but cannot
 * create or revoke. Backend enforcement closes the gap that previously made
 * the client-side nav filter the only barrier.
 */
@ApiTags('API Keys')
@ApiBearerAuth()
@Controller('api/v1/api-keys')
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Post()
  @RequireCapability('manage_api_keys')
  @RequireVerifiedEmail()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new API key (full key shown only once)' })
  async create(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthSession,
    @Body()
    body: {
      name: string;
      scopes?: string[];
      rate_limit_per_min?: number;
      expires_at?: string;
    },
  ) {
    return this.apiKeysService.create(
      tenantId,
      user.id,
      body.name,
      body.scopes,
      body.rate_limit_per_min,
      body.expires_at ? new Date(body.expires_at) : undefined,
    );
  }

  @Get()
  @RequireCapability('read_api_keys')
  @ApiOperation({ summary: 'List API keys for the current tenant (optional ?search=)' })
  async list(
    @TenantId() tenantId: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('search') search?: string,
  ) {
    return this.apiKeysService.list(
      tenantId,
      parseInt(page, 10),
      parseInt(pageSize, 10),
      search,
    );
  }

  @Get(':id')
  @RequireCapability('read_api_keys')
  @ApiOperation({ summary: 'Get API key details (key hash never exposed)' })
  async getById(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.apiKeysService.getById(tenantId, id);
  }

  @Delete(':id')
  @RequireCapability('manage_api_keys')
  @RequireVerifiedEmail()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke an API key' })
  async revoke(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.apiKeysService.revoke(tenantId, id);
  }

  @Get(':id/usage')
  @RequireCapability('read_api_keys')
  @ApiOperation({ summary: 'Get usage metrics for an API key' })
  async getUsage(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('days') days = '30',
  ) {
    return this.apiKeysService.getUsage(tenantId, id, parseInt(days, 10));
  }
}
