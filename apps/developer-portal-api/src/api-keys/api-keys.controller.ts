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
import { CurrentUser, TenantId, type AuthSession } from '@sso-platform/nestjs-auth';
import { ApiKeysService } from './api-keys.service';

@ApiTags('API Keys')
@ApiBearerAuth()
@Controller('api/v1/api-keys')
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Post()
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
  @ApiOperation({ summary: 'List API keys for the current tenant' })
  async list(
    @TenantId() tenantId: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    return this.apiKeysService.list(
      tenantId,
      parseInt(page, 10),
      parseInt(pageSize, 10),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get API key details (key hash never exposed)' })
  async getById(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.apiKeysService.getById(tenantId, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke an API key' })
  async revoke(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.apiKeysService.revoke(tenantId, id);
  }

  @Get(':id/usage')
  @ApiOperation({ summary: 'Get usage metrics for an API key' })
  async getUsage(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('days') days = '30',
  ) {
    return this.apiKeysService.getUsage(tenantId, id, parseInt(days, 10));
  }
}
