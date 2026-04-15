import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { ScimAuthGuard } from '../guards/scim-auth.guard';
import { ScimService } from '../services/scim.service';
import {
  CreateScimUserDto,
  ReplaceScimUserDto,
  SCIM_LIST_SCHEMA,
  SCIM_USER_SCHEMA,
  ScimListResponse,
  ScimUserResource,
} from '../dto/scim-user.dto';
import { toScimUser } from '../helpers/scim-mapper';

@ApiTags('SCIM Users')
@ApiBearerAuth()
@UseGuards(ScimAuthGuard)
@Controller('scim/v2/Users')
export class ScimUsersController {
  constructor(private readonly scimService: ScimService) {}

  @Get()
  async listUsers(
    @Req() req: Request,
    @Query('startIndex') startIndex?: string,
    @Query('count') count?: string,
    @Query('filter') filter?: string,
  ): Promise<ScimListResponse<ScimUserResource>> {
    const tenantId = (req as any).tenantId;
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    const result = await this.scimService.listUsers(
      tenantId,
      startIndex ? parseInt(startIndex, 10) : 1,
      count ? parseInt(count, 10) : 100,
      filter,
    );

    return {
      schemas: [SCIM_LIST_SCHEMA],
      totalResults: result.total,
      startIndex: result.startIndex,
      itemsPerPage: result.count,
      Resources: result.users.map((u) => toScimUser(u, baseUrl)),
    };
  }

  @Get(':id')
  async getUser(
    @Req() req: Request,
    @Param('id') id: string,
  ): Promise<ScimUserResource> {
    const tenantId = (req as any).tenantId;
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const user = await this.scimService.getUserById(tenantId, id);
    return toScimUser(user, baseUrl);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createUser(
    @Req() req: Request,
    @Body() dto: CreateScimUserDto,
  ): Promise<ScimUserResource> {
    const tenantId = (req as any).tenantId;
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const user = await this.scimService.provisionUser(tenantId, dto);
    return toScimUser(user, baseUrl);
  }

  @Put(':id')
  async replaceUser(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: ReplaceScimUserDto,
  ): Promise<ScimUserResource> {
    const tenantId = (req as any).tenantId;
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const user = await this.scimService.replaceUser(tenantId, id, dto);
    return toScimUser(user, baseUrl);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteUser(
    @Req() req: Request,
    @Param('id') id: string,
  ): Promise<void> {
    const tenantId = (req as any).tenantId;
    await this.scimService.deprovisionUser(tenantId, id);
  }
}
