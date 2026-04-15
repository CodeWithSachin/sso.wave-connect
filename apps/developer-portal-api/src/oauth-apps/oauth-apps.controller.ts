import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { OAuthAppsService } from './oauth-apps.service';

@ApiTags('OAuth Applications')
@ApiBearerAuth()
@Controller('api/v1/oauth-apps')
export class OAuthAppsController {
  constructor(private readonly oauthAppsService: OAuthAppsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new OAuth application' })
  async create(@Body() body: { name: string; redirect_uris: string[]; allowed_scopes?: string[] }) {
    const tenantId = '01473191-863b-4035-ac65-05782ca6159b';
    return this.oauthAppsService.create(tenantId, body);
  }

  @Get()
  @ApiOperation({ summary: 'List OAuth applications' })
  async list(@Query('page') page = '1', @Query('pageSize') pageSize = '20') {
    const tenantId = '01473191-863b-4035-ac65-05782ca6159b';
    return this.oauthAppsService.list(tenantId, parseInt(page, 10), parseInt(pageSize, 10));
  }

  @Post(':id/rotate-secret')
  @ApiOperation({ summary: 'Rotate client secret (new secret shown once)' })
  async rotateSecret(@Param('id', ParseUUIDPipe) id: string) {
    const tenantId = '01473191-863b-4035-ac65-05782ca6159b';
    return this.oauthAppsService.rotateSecret(tenantId, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id', ParseUUIDPipe) id: string) {
    const tenantId = '01473191-863b-4035-ac65-05782ca6159b';
    await this.oauthAppsService.delete(tenantId, id);
  }
}
