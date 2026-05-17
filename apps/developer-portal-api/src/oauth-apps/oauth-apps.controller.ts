import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import {
  CurrentUser,
  RequireCapability,
  RequirePermission,
  RequireVerifiedEmail,
  TenantId,
  type AuthSession,
} from '@sso-platform/nestjs-auth';
import { OAuthAppsService } from './oauth-apps.service';

/**
 * OAuth app management. Capability gates (ADR-0002 + Item 1.2 split):
 *   - Reads (`list`): `read_oauth_apps` (any active membership).
 *   - Writes (`create`, `update`, `rotate-secret`, `delete`): `manage_oauth_apps`.
 */
@ApiTags('OAuth Applications')
@ApiBearerAuth()
@Controller('api/v1/oauth-apps')
export class OAuthAppsController {
  constructor(private readonly oauthAppsService: OAuthAppsService) {}

  @Post()
  @RequireCapability('manage_oauth_apps')
  @RequireVerifiedEmail()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new OAuth application' })
  async create(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthSession,
    @Body() body: { name: string; redirect_uris: string[]; allowed_scopes?: string[] },
  ) {
    return this.oauthAppsService.create(tenantId, user.id, body);
  }

  @Get()
  @RequireCapability('read_oauth_apps')
  @ApiOperation({ summary: 'List OAuth applications (optional ?search=)' })
  async list(
    @TenantId() tenantId: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('search') search?: string,
  ) {
    return this.oauthAppsService.list(tenantId, parseInt(page, 10), parseInt(pageSize, 10), search);
  }

  @Post(':id/rotate-secret')
  @RequireCapability('manage_oauth_apps')
  @RequirePermission('can_edit', 'oauth_app')
  @RequireVerifiedEmail()
  @ApiOperation({ summary: 'Rotate client secret (new secret shown once)' })
  async rotateSecret(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.oauthAppsService.rotateSecret(tenantId, id);
  }

  @Patch(':id')
  @RequireCapability('manage_oauth_apps')
  @RequirePermission('can_edit', 'oauth_app')
  @RequireVerifiedEmail()
  @ApiOperation({ summary: 'Update an OAuth application (name, redirect URIs, scopes)' })
  async update(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { name?: string; redirect_uris?: string[]; allowed_scopes?: string[] },
  ) {
    return this.oauthAppsService.update(tenantId, id, body);
  }

  @Delete(':id')
  @RequireCapability('manage_oauth_apps')
  @RequirePermission('can_delete', 'oauth_app')
  @RequireVerifiedEmail()
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.oauthAppsService.delete(tenantId, id);
  }
}
