import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
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
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AllowPlatformRole, PlatformAdminGuard } from '@sso-platform/nestjs-auth';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import {
  PaginatedTenantsResponseDto,
  TenantResponseDto,
} from './dto/tenant-response.dto';

/**
 * Tenant CRUD is cross-tenant and therefore reserved for platform staff. The
 * app-wide `SessionCookieGuard` still runs first; `PlatformAdminGuard` then
 * rejects any session whose user isn't in `platform_admins`. Destructive
 * operations are further narrowed to `superadmin` via `@AllowPlatformRole`.
 */
@ApiTags('tenants')
@ApiBearerAuth()
@UseGuards(PlatformAdminGuard)
@Controller('api/v1/tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post()
  @AllowPlatformRole('superadmin')
  @ApiOperation({ summary: 'Create a new tenant (superadmin only)' })
  @ApiCreatedResponse({ type: TenantResponseDto, description: 'Tenant created' })
  @ApiUnauthorizedResponse({ description: 'No valid session cookie' })
  @ApiForbiddenResponse({ description: 'Caller is not a platform superadmin' })
  create(@Body() dto: CreateTenantDto) {
    return this.tenantsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all tenants (paginated)' })
  @ApiOkResponse({ type: PaginatedTenantsResponseDto })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, example: 20 })
  findAll(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.tenantsService.findAll(
      page ? parseInt(page, 10) : 1,
      pageSize ? parseInt(pageSize, 10) : 20,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a tenant by ID' })
  @ApiOkResponse({ type: TenantResponseDto })
  @ApiNotFoundResponse({ description: 'Tenant not found' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.tenantsService.findOne(id);
  }

  @Patch(':id')
  @AllowPlatformRole('superadmin')
  @ApiOperation({ summary: 'Update a tenant (superadmin only, optimistic locking via version)' })
  @ApiOkResponse({ type: TenantResponseDto })
  @ApiForbiddenResponse({ description: 'Caller is not a platform superadmin' })
  @ApiNotFoundResponse({ description: 'Tenant not found' })
  @ApiConflictResponse({ description: 'Version conflict — tenant was modified concurrently' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTenantDto,
  ) {
    return this.tenantsService.update(id, dto);
  }

  @Delete(':id')
  @AllowPlatformRole('superadmin')
  @ApiOperation({ summary: 'Soft-delete a tenant (superadmin only)' })
  @ApiOkResponse({ type: TenantResponseDto })
  @ApiForbiddenResponse({ description: 'Caller is not a platform superadmin' })
  @ApiNotFoundResponse({ description: 'Tenant not found' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.tenantsService.remove(id);
  }
}
