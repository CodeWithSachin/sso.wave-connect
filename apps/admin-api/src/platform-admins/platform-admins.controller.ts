import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  AllowPlatformRole,
  CurrentUser,
  PlatformAdminGuard,
  type AuthSession,
} from '@sso-platform/nestjs-auth';
import { PlatformAdminsService } from './platform-admins.service';
import { GrantPlatformAdminDto } from './dto/grant-platform-admin.dto';
import {
  PlatformAdminListResponseDto,
  PlatformAdminResponseDto,
} from './dto/platform-admin-response.dto';

/**
 * Cross-tenant platform-admin management. Gated by `PlatformAdminGuard` — the
 * app-level `SessionCookieGuard` still runs first to populate `request.user`.
 * Grant/revoke are restricted to superadmins; list + get are open to any active
 * platform admin.
 */
@ApiTags('platform-admins')
@ApiBearerAuth()
@UseGuards(PlatformAdminGuard)
@Controller('api/v1/platform/admins')
export class PlatformAdminsController {
  constructor(private readonly service: PlatformAdminsService) {}

  @Post()
  @AllowPlatformRole('superadmin')
  @ApiOperation({ summary: 'Grant platform-admin privileges to a user (superadmin only)' })
  @ApiCreatedResponse({ type: PlatformAdminResponseDto })
  @ApiUnauthorizedResponse({ description: 'No valid session cookie' })
  @ApiForbiddenResponse({ description: 'Caller is not a superadmin' })
  @ApiConflictResponse({ description: 'User is already an active platform admin' })
  grant(@Body() dto: GrantPlatformAdminDto, @CurrentUser() me: AuthSession) {
    return this.service.grant(dto, me.id);
  }

  @Get()
  @ApiOperation({ summary: 'List active platform admins' })
  @ApiOkResponse({ type: PlatformAdminListResponseDto })
  list() {
    return this.service.list();
  }

  @Get(':userId')
  @ApiOperation({ summary: 'Get a platform admin by user id' })
  @ApiOkResponse({ type: PlatformAdminResponseDto })
  @ApiNotFoundResponse({ description: 'Not found or revoked' })
  findOne(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.service.findOne(userId);
  }

  @Delete(':userId')
  @AllowPlatformRole('superadmin')
  @ApiOperation({ summary: 'Revoke platform-admin privileges (superadmin only)' })
  @ApiOkResponse({ type: PlatformAdminResponseDto })
  @ApiForbiddenResponse({ description: 'Caller is not a superadmin' })
  @ApiNotFoundResponse({ description: 'Not found or already revoked' })
  @ApiConflictResponse({ description: 'Cannot revoke your own grant' })
  revoke(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() me: AuthSession,
  ) {
    return this.service.revoke(userId, me.id);
  }
}
