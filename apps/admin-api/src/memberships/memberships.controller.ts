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
import { RequireCapability, RequireVerifiedEmail, TenantId } from '@sso-platform/nestjs-auth';
import { MembershipsService } from './memberships.service';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import {
  MembershipResponseDto,
  PaginatedMembershipsResponseDto,
} from './dto/membership-response.dto';

/**
 * Tenant-member management. Capability gates (ADR-0002 + Item 1.2 split):
 *   - Reads (`list`, `get`): `read_members` (any active organization
 *     membership; the cap split lets billing_manager / readonly audit the
 *     team list without inheriting writeful manage_*).
 *   - Role change: `manage_members` (writeful).
 *   - Invite / revoke / resend: `manage_invitations`.
 */
@ApiTags('memberships')
@ApiBearerAuth()
@Controller('api/v1/memberships')
export class MembershipsController {
  constructor(private readonly membershipsService: MembershipsService) {}

  @Post()
  @RequireCapability('manage_invitations')
  @RequireVerifiedEmail()
  @ApiOperation({ summary: 'Invite a user to the tenant' })
  @ApiCreatedResponse({ type: MembershipResponseDto })
  @ApiConflictResponse({ description: 'User already a member' })
  @ApiNotFoundResponse({ description: 'User email not found' })
  invite(
    @TenantId() tenantId: string,
    @Body() dto: InviteMemberDto,
  ) {
    return this.membershipsService.invite(tenantId, dto);
  }

  @Get()
  @RequireCapability('read_members')
  @ApiOperation({ summary: 'List tenant memberships (paginated, optional status filter)' })
  @ApiOkResponse({ type: PaginatedMembershipsResponseDto })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, example: 20 })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['pending', 'accepted', 'expired'],
    description:
      'Filter by derived invitation status. Soft-deleted rows always excluded.',
  })
  findAll(
    @TenantId() tenantId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: 'pending' | 'accepted' | 'expired',
  ) {
    return this.membershipsService.findAll(
      tenantId,
      page ? parseInt(page, 10) : 1,
      pageSize ? parseInt(pageSize, 10) : 20,
      status,
    );
  }

  @Get(':id')
  @RequireCapability('read_members')
  @ApiOperation({ summary: 'Get a membership by ID' })
  @ApiOkResponse({ type: MembershipResponseDto })
  @ApiNotFoundResponse({ description: 'Membership not found' })
  findOne(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.membershipsService.findOne(tenantId, id);
  }

  @Patch(':id/role')
  @RequireCapability('manage_members')
  @RequireVerifiedEmail()
  @ApiOperation({ summary: 'Update a member role (writes to authz outbox)' })
  @ApiOkResponse({ type: MembershipResponseDto })
  @ApiNotFoundResponse({ description: 'Membership not found' })
  updateRole(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.membershipsService.updateRole(tenantId, id, dto);
  }

  @Delete(':id')
  @RequireCapability('manage_invitations')
  @RequireVerifiedEmail()
  @ApiOperation({ summary: 'Remove a member from the tenant' })
  @ApiOkResponse({ type: MembershipResponseDto })
  @ApiNotFoundResponse({ description: 'Membership not found' })
  remove(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.membershipsService.remove(tenantId, id);
  }

  /**
   * Resend an invitation email for a pending membership. Idempotent: rotates
   * the token, extends the expiry, and re-sends. Per plan v2 decision #3,
   * the caller must currently hold `manage_invitations` — same auth model as
   * delete, so SessionCookieGuard + tenant scoping covers it.
   */
  @Post(':id/resend')
  @RequireCapability('manage_invitations')
  @RequireVerifiedEmail()
  @ApiOperation({
    summary: 'Resend the invitation email for a pending membership',
  })
  @ApiOkResponse({ type: MembershipResponseDto })
  @ApiConflictResponse({ description: 'Membership already accepted' })
  @ApiNotFoundResponse({ description: 'Membership not found' })
  resend(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.membershipsService.resend(tenantId, id);
  }
}
