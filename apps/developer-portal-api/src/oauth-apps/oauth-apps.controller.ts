import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TenantId } from '@sso-platform/nestjs-auth';
import { OAuthAppsService } from './oauth-apps.service';

@ApiTags('OAuth Applications')
@ApiBearerAuth()
@Controller('api/v1/oauth-apps')
export class OAuthAppsController {
  constructor(private readonly oauthAppsService: OAuthAppsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new OAuth application' })
  async create(
    @TenantId() tenantId: string,
    @Body() body: { name: string; redirect_uris: string[]; allowed_scopes?: string[] },
  ) {
    return this.oauthAppsService.create(tenantId, body);
  }

  @Get()
  @ApiOperation({ summary: 'List OAuth applications' })
  async list(
    @TenantId() tenantId: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    return this.oauthAppsService.list(tenantId, parseInt(page, 10), parseInt(pageSize, 10));
  }

  @Post(':id/rotate-secret')
  @ApiOperation({ summary: 'Rotate client secret (new secret shown once)' })
  async rotateSecret(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.oauthAppsService.rotateSecret(tenantId, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.oauthAppsService.delete(tenantId, id);
  }
}
