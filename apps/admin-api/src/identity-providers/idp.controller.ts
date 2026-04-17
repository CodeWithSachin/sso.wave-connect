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
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { TenantId } from '@sso-platform/nestjs-auth';
import { IdpService } from './idp.service';
import { CreateSamlIdpDto, CreateOidcIdpDto } from './dto/create-idp.dto';
import { UpdateIdpDto } from './dto/update-idp.dto';
import { IdpResponseDto, PaginatedIdpsResponseDto } from './dto/idp-response.dto';

@ApiTags('identity-providers')
@ApiBearerAuth()
@Controller('api/v1/identity-providers')
export class IdpController {
  constructor(private readonly idpService: IdpService) {}

  @Post('saml')
  @ApiOperation({ summary: 'Create a SAML identity provider' })
  @ApiCreatedResponse({ type: IdpResponseDto })
  createSaml(
    @TenantId() tenantId: string,
    @Body() dto: CreateSamlIdpDto,
  ) {
    return this.idpService.createSaml(tenantId, dto);
  }

  @Post('oidc')
  @ApiOperation({ summary: 'Create an OIDC identity provider' })
  @ApiCreatedResponse({ type: IdpResponseDto })
  createOidc(
    @TenantId() tenantId: string,
    @Body() dto: CreateOidcIdpDto,
  ) {
    return this.idpService.createOidc(tenantId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List identity providers (paginated)' })
  @ApiOkResponse({ type: PaginatedIdpsResponseDto })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  findAll(
    @TenantId() tenantId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.idpService.findAll(
      tenantId,
      page ? parseInt(page, 10) : 1,
      pageSize ? parseInt(pageSize, 10) : 20,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an identity provider by ID' })
  @ApiOkResponse({ type: IdpResponseDto })
  @ApiNotFoundResponse({ description: 'IdP not found' })
  findOne(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.idpService.findOne(tenantId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an identity provider' })
  @ApiOkResponse({ type: IdpResponseDto })
  @ApiNotFoundResponse({ description: 'IdP not found' })
  @ApiConflictResponse({ description: 'Version conflict' })
  update(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIdpDto,
  ) {
    return this.idpService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete an identity provider' })
  @ApiOkResponse({ type: IdpResponseDto })
  @ApiNotFoundResponse({ description: 'IdP not found' })
  remove(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.idpService.remove(tenantId, id);
  }
}
