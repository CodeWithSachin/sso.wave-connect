import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { RequireCapability, RequireVerifiedEmail, TenantId } from '@sso-platform/nestjs-auth';
import { GroupsService } from './groups.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { AddGroupMemberDto } from './dto/add-member.dto';
import { NestGroupDto } from './dto/nest-group.dto';
import { GroupResponseDto, PaginatedGroupsResponseDto } from './dto/group-response.dto';

@ApiTags('groups')
@ApiBearerAuth()
@Controller('api/v1/groups')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Post()
  @RequireCapability('manage_members')
  @RequireVerifiedEmail()
  @ApiOperation({ summary: 'Create a group' })
  @ApiCreatedResponse({ type: GroupResponseDto })
  create(
    @TenantId() tenantId: string,
    @Body() dto: CreateGroupDto,
  ) {
    return this.groupsService.create(tenantId, dto);
  }

  @Get()
  @RequireCapability('read_members')
  @ApiOperation({ summary: 'List groups (paginated, optional ?search=)' })
  @ApiOkResponse({ type: PaginatedGroupsResponseDto })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Case-insensitive substring match across name + description. Server caps at 200 chars.',
  })
  findAll(
    @TenantId() tenantId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
  ) {
    return this.groupsService.findAll(
      tenantId,
      page ? parseInt(page, 10) : 1,
      pageSize ? parseInt(pageSize, 10) : 20,
      search,
    );
  }

  @Get(':id')
  @RequireCapability('read_members')
  @ApiOperation({ summary: 'Get a group with members and nesting' })
  @ApiOkResponse({ type: GroupResponseDto })
  @ApiNotFoundResponse({ description: 'Group not found' })
  findOne(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.groupsService.findOne(tenantId, id);
  }

  @Delete(':id')
  @RequireCapability('manage_members')
  @RequireVerifiedEmail()
  @ApiOperation({ summary: 'Soft-delete a group' })
  @ApiOkResponse({ type: GroupResponseDto })
  @ApiNotFoundResponse({ description: 'Group not found' })
  remove(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.groupsService.remove(tenantId, id);
  }

  // --- Members ---

  @Post(':id/members')
  @RequireCapability('manage_members')
  @RequireVerifiedEmail()
  @ApiOperation({ summary: 'Add a member to a group' })
  @ApiCreatedResponse({ description: 'Member added' })
  addMember(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) groupId: string,
    @Body() dto: AddGroupMemberDto,
  ) {
    return this.groupsService.addMember(tenantId, groupId, dto);
  }

  @Delete(':id/members/:userId')
  @RequireCapability('manage_members')
  @RequireVerifiedEmail()
  @ApiOperation({ summary: 'Remove a member from a group' })
  @ApiOkResponse({ description: 'Member removed' })
  @ApiNotFoundResponse({ description: 'Member not in group' })
  removeMember(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) groupId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.groupsService.removeMember(tenantId, groupId, userId);
  }

  // --- Nesting ---

  @Post(':id/children')
  @RequireCapability('manage_members')
  @RequireVerifiedEmail()
  @ApiOperation({ summary: 'Nest a child group under this group' })
  @ApiCreatedResponse({ description: 'Group nested' })
  @ApiConflictResponse({ description: 'Cannot nest a group under itself' })
  nestGroup(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) parentGroupId: string,
    @Body() dto: NestGroupDto,
  ) {
    return this.groupsService.nestGroup(tenantId, parentGroupId, dto);
  }

  @Delete(':id/children/:childGroupId')
  @RequireCapability('manage_members')
  @RequireVerifiedEmail()
  @ApiOperation({ summary: 'Remove a nested child group' })
  @ApiOkResponse({ description: 'Nesting removed' })
  @ApiNotFoundResponse({ description: 'Nesting not found' })
  unnestGroup(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) parentGroupId: string,
    @Param('childGroupId', ParseUUIDPipe) childGroupId: string,
  ) {
    return this.groupsService.unnestGroup(tenantId, parentGroupId, childGroupId);
  }
}
