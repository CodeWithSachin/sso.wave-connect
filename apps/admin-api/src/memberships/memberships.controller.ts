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
import { MembershipsService } from './memberships.service';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import {
  MembershipResponseDto,
  PaginatedMembershipsResponseDto,
} from './dto/membership-response.dto';

@ApiTags('memberships')
@ApiBearerAuth()
@Controller('api/v1/tenants/:tenantId/memberships')
export class MembershipsController {
  constructor(private readonly membershipsService: MembershipsService) {}

  @Post()
  @ApiOperation({ summary: 'Invite a user to the tenant' })
  @ApiCreatedResponse({ type: MembershipResponseDto })
  @ApiConflictResponse({ description: 'User already a member' })
  @ApiNotFoundResponse({ description: 'User email not found' })
  invite(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() dto: InviteMemberDto,
  ) {
    return this.membershipsService.invite(tenantId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List tenant memberships (paginated)' })
  @ApiOkResponse({ type: PaginatedMembershipsResponseDto })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, example: 20 })
  findAll(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.membershipsService.findAll(
      tenantId,
      page ? parseInt(page, 10) : 1,
      pageSize ? parseInt(pageSize, 10) : 20,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a membership by ID' })
  @ApiOkResponse({ type: MembershipResponseDto })
  @ApiNotFoundResponse({ description: 'Membership not found' })
  findOne(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.membershipsService.findOne(tenantId, id);
  }

  @Patch(':id/role')
  @ApiOperation({ summary: 'Update a member role (writes to authz outbox)' })
  @ApiOkResponse({ type: MembershipResponseDto })
  @ApiNotFoundResponse({ description: 'Membership not found' })
  updateRole(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.membershipsService.updateRole(tenantId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove a member from the tenant' })
  @ApiOkResponse({ type: MembershipResponseDto })
  @ApiNotFoundResponse({ description: 'Membership not found' })
  remove(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.membershipsService.remove(tenantId, id);
  }
}
