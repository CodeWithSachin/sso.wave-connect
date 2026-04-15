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
    @Body()
    body: {
      name: string;
      scopes?: string[];
      rate_limit_per_min?: number;
      expires_at?: string;
    },
  ) {
    // TODO: Extract tenantId and userId from PASETO token via guard
    const tenantId = '01473191-863b-4035-ac65-05782ca6159b'; // Placeholder
    const userId = '00000000-0000-0000-0000-000000000001';

    return this.apiKeysService.create(
      tenantId,
      userId,
      body.name,
      body.scopes,
      body.rate_limit_per_min,
      body.expires_at ? new Date(body.expires_at) : undefined,
    );
  }

  @Get()
  @ApiOperation({ summary: 'List API keys for the current tenant' })
  async list(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    const tenantId = '01473191-863b-4035-ac65-05782ca6159b';
    return this.apiKeysService.list(
      tenantId,
      parseInt(page, 10),
      parseInt(pageSize, 10),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get API key details (key hash never exposed)' })
  async getById(@Param('id', ParseUUIDPipe) id: string) {
    const tenantId = '01473191-863b-4035-ac65-05782ca6159b';
    return this.apiKeysService.getById(tenantId, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke an API key' })
  async revoke(@Param('id', ParseUUIDPipe) id: string) {
    const tenantId = '01473191-863b-4035-ac65-05782ca6159b';
    await this.apiKeysService.revoke(tenantId, id);
  }

  @Get(':id/usage')
  @ApiOperation({ summary: 'Get usage metrics for an API key' })
  async getUsage(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('days') days = '30',
  ) {
    const tenantId = '01473191-863b-4035-ac65-05782ca6159b';
    return this.apiKeysService.getUsage(tenantId, id, parseInt(days, 10));
  }
}
