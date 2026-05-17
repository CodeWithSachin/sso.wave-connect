import { Body, Controller, Get, Patch } from '@nestjs/common';
import {
	ApiBearerAuth,
	ApiConflictResponse,
	ApiNotFoundResponse,
	ApiOkResponse,
	ApiOperation,
	ApiTags,
} from '@nestjs/swagger';
import { RequireCapability, RequireVerifiedEmail, TenantId } from '@sso-platform/nestjs-auth';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { TenantResponseDto } from './dto/tenant-response.dto';
import { TenantsService } from './tenants.service';

/**
 * Self-service view of "the tenant I'm currently signed into".
 *
 * Distinct from /api/v1/tenants which is platform-admin-only (cross-tenant).
 * Here the tenant id is bound to the session cookie via @TenantId, so a
 * regular tenant admin can read + update only their own tenant.
 *
 * The capability gate to actually allow updates lives in the SessionCookieGuard
 * + the existing tenant-admin role check in TenantsService.update (which
 * checks the optimistic-locking `version` field). For v1 we accept the same
 * UpdateTenantDto as the platform endpoint — overly permissive fields like
 * `slug` will be rejected by class-validator if we tighten the DTO later.
 */
// SessionCookieGuard is already wired as an APP_GUARD in app.module — repeating
// it as @UseGuards here would have Nest instantiate a NEW SessionCookieGuard
// transiently, without resolving the SESSION_DB_CLIENT token, which is why
// /api/v1/my-tenant used to fail with "Session validation is not configured".
// The global APP_GUARD is sufficient.
@ApiTags('tenants')
@ApiBearerAuth()
@Controller('api/v1/my-tenant')
export class MyTenantController {
	constructor(private readonly tenantsService: TenantsService) {}

	@Get()
	@RequireCapability('view_tenant_settings')
	@ApiOperation({ summary: 'Get the tenant the session is currently bound to' })
	@ApiOkResponse({ type: TenantResponseDto })
	@ApiNotFoundResponse({ description: 'Tenant not found' })
	findMine(@TenantId() tenantId: string) {
		return this.tenantsService.findOne(tenantId);
	}

	@Patch()
	@RequireCapability('manage_members')
	@RequireVerifiedEmail()
	@ApiOperation({ summary: 'Update fields on the current tenant (optimistic lock via version)' })
	@ApiOkResponse({ type: TenantResponseDto })
	@ApiConflictResponse({ description: 'Version conflict — tenant was modified concurrently' })
	updateMine(
		@TenantId() tenantId: string,
		@Body() dto: UpdateTenantDto,
	) {
		return this.tenantsService.update(tenantId, dto);
	}
}
