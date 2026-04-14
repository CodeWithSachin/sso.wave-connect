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
import { GroupsService } from './groups.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { AddGroupMemberDto } from './dto/add-member.dto';
import { NestGroupDto } from './dto/nest-group.dto';
import { GroupResponseDto, PaginatedGroupsResponseDto } from './dto/group-response.dto';

@ApiTags('groups')
@ApiBearerAuth()
@Controller('api/v1/tenants/:tenantId/groups')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a group' })
  @ApiCreatedResponse({ type: GroupResponseDto })
  create(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() dto: CreateGroupDto,
  ) {
    return this.groupsService.create(tenantId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List groups (paginated)' })
  @ApiOkResponse({ type: PaginatedGroupsResponseDto })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  findAll(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.groupsService.findAll(
      tenantId,
      page ? parseInt(page, 10) : 1,
      pageSize ? parseInt(pageSize, 10) : 20,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a group with members and nesting' })
  @ApiOkResponse({ type: GroupResponseDto })
  @ApiNotFoundResponse({ description: 'Group not found' })
  findOne(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.groupsService.findOne(tenantId, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a group' })
  @ApiOkResponse({ type: GroupResponseDto })
  @ApiNotFoundResponse({ description: 'Group not found' })
  remove(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.groupsService.remove(tenantId, id);
  }

  // --- Members ---

  @Post(':id/members')
  @ApiOperation({ summary: 'Add a member to a group' })
  @ApiCreatedResponse({ description: 'Member added' })
  addMember(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('id', ParseUUIDPipe) groupId: string,
    @Body() dto: AddGroupMemberDto,
  ) {
    return this.groupsService.addMember(tenantId, groupId, dto);
  }

  @Delete(':id/members/:userId')
  @ApiOperation({ summary: 'Remove a member from a group' })
  @ApiOkResponse({ description: 'Member removed' })
  @ApiNotFoundResponse({ description: 'Member not in group' })
  removeMember(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('id', ParseUUIDPipe) groupId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.groupsService.removeMember(tenantId, groupId, userId);
  }

  // --- Nesting ---

  @Post(':id/children')
  @ApiOperation({ summary: 'Nest a child group under this group' })
  @ApiCreatedResponse({ description: 'Group nested' })
  @ApiConflictResponse({ description: 'Cannot nest a group under itself' })
  nestGroup(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('id', ParseUUIDPipe) parentGroupId: string,
    @Body() dto: NestGroupDto,
  ) {
    return this.groupsService.nestGroup(tenantId, parentGroupId, dto);
  }

  @Delete(':id/children/:childGroupId')
  @ApiOperation({ summary: 'Remove a nested child group' })
  @ApiOkResponse({ description: 'Nesting removed' })
  @ApiNotFoundResponse({ description: 'Nesting not found' })
  unnestGroup(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('id', ParseUUIDPipe) parentGroupId: string,
    @Param('childGroupId', ParseUUIDPipe) childGroupId: string,
  ) {
    return this.groupsService.unnestGroup(tenantId, parentGroupId, childGroupId);
  }
}
