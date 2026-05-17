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
  Headers,
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
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PaginatedUsersResponseDto, UserResponseDto } from './dto/user-response.dto';

@ApiTags('users')
@ApiBearerAuth()
@Controller('api/v1/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @RequireCapability('manage_members')
  @RequireVerifiedEmail()
  @ApiOperation({ summary: 'Create a user in a tenant' })
  @ApiCreatedResponse({ type: UserResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing token' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  create(
    @TenantId() tenantId: string,
    @Body() dto: CreateUserDto,
  ) {
    return this.usersService.create(tenantId, dto);
  }

  @Get()
  @RequireCapability('read_members')
  @ApiOperation({ summary: 'List users in a tenant (paginated, optional ?search=)' })
  @ApiOkResponse({ type: PaginatedUsersResponseDto })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, example: 20 })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description:
      'Case-insensitive substring match across email, displayName, firstName, lastName. Server caps at 200 chars.',
  })
  findAll(
    @TenantId() tenantId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
  ) {
    return this.usersService.findAll(
      tenantId,
      page ? parseInt(page, 10) : 1,
      pageSize ? parseInt(pageSize, 10) : 20,
      search,
    );
  }

  @Get(':id')
  @RequireCapability('read_members')
  @ApiOperation({ summary: 'Get a user by ID' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiNotFoundResponse({ description: 'User not found in tenant' })
  findOne(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.usersService.findOne(tenantId, id);
  }

  @Patch(':id')
  @RequireCapability('manage_members')
  @RequireVerifiedEmail()
  @ApiOperation({ summary: 'Update a user (optimistic locking)' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiConflictResponse({ description: 'Version conflict' })
  update(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @RequireCapability('manage_members')
  @RequireVerifiedEmail()
  @ApiOperation({ summary: 'Soft-delete a user' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiNotFoundResponse({ description: 'User not found' })
  remove(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.usersService.remove(tenantId, id);
  }
}
