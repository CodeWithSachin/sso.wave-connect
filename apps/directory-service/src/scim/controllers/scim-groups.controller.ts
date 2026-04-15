import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { ScimAuthGuard } from '../guards/scim-auth.guard';
import { ScimService } from '../services/scim.service';
import {
  CreateScimGroupDto,
  ScimPatchRequest,
  ScimGroupResource,
  SCIM_GROUP_SCHEMA,
} from '../dto/scim-group.dto';
import { SCIM_LIST_SCHEMA, ScimListResponse } from '../dto/scim-user.dto';
import { toScimGroup } from '../helpers/scim-mapper';

@ApiTags('SCIM Groups')
@ApiBearerAuth()
@UseGuards(ScimAuthGuard)
@Controller('scim/v2/Groups')
export class ScimGroupsController {
  constructor(private readonly scimService: ScimService) {}

  @Get()
  async listGroups(
    @Req() req: Request,
    @Query('startIndex') startIndex?: string,
    @Query('count') count?: string,
  ): Promise<ScimListResponse<ScimGroupResource>> {
    const tenantId = (req as any).tenantId;
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    const result = await this.scimService.listGroups(
      tenantId,
      startIndex ? parseInt(startIndex, 10) : 1,
      count ? parseInt(count, 10) : 100,
    );

    const resources: ScimGroupResource[] = [];
    for (const g of result.groups) {
      const { members } = await this.scimService.getGroupById(tenantId, g.id);
      resources.push(toScimGroup(g, members, baseUrl));
    }

    return {
      schemas: [SCIM_LIST_SCHEMA],
      totalResults: result.total,
      startIndex: result.startIndex,
      itemsPerPage: result.count,
      Resources: resources,
    };
  }

  @Get(':id')
  async getGroup(
    @Req() req: Request,
    @Param('id') id: string,
  ): Promise<ScimGroupResource> {
    const tenantId = (req as any).tenantId;
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const { group, members } = await this.scimService.getGroupById(
      tenantId,
      id,
    );
    return toScimGroup(group, members, baseUrl);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createGroup(
    @Req() req: Request,
    @Body() dto: CreateScimGroupDto,
  ): Promise<ScimGroupResource> {
    const tenantId = (req as any).tenantId;
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const { group, members } = await this.scimService.provisionGroup(
      tenantId,
      dto,
    );
    return toScimGroup(group, members, baseUrl);
  }

  @Patch(':id')
  async patchGroup(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: ScimPatchRequest,
  ): Promise<ScimGroupResource> {
    const tenantId = (req as any).tenantId;
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const { group, members } = await this.scimService.patchGroup(
      tenantId,
      id,
      body.Operations,
    );
    return toScimGroup(group, members, baseUrl);
  }
}
