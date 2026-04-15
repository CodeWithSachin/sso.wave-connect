import { Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../shared/prisma/prisma.service';

@ApiTags('SCIM Tokens')
@ApiBearerAuth()
@Controller('api/v1/scim-tokens')
export class ScimTokensController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Generate a new SCIM provisioning token' })
  async create() {
    const tenantId = '01473191-863b-4035-ac65-05782ca6159b';
    const rawToken = randomBytes(32).toString('hex');
    const prefix = rawToken.substring(0, 8);
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const id = crypto.randomUUID();

    await this.prisma.$executeRaw`
      INSERT INTO scim_tokens (id, tenant_id, token_hash, token_prefix, is_active, created_at)
      VALUES (${id}::uuid, ${tenantId}::uuid, ${tokenHash}, ${prefix}, true, NOW())
    `;

    return { id, token: rawToken, prefix, message: 'Token shown only once. Store it securely.' };
  }

  @Get()
  @ApiOperation({ summary: 'List SCIM tokens' })
  async list() {
    const tenantId = '01473191-863b-4035-ac65-05782ca6159b';
    const tokens = await this.prisma.$queryRaw`
      SELECT id, token_prefix, is_active, last_used_at, created_at, expires_at
      FROM scim_tokens WHERE tenant_id = ${tenantId}::uuid
      ORDER BY created_at DESC
    `;
    return { data: tokens };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a SCIM token' })
  async revoke(@Param('id', ParseUUIDPipe) id: string) {
    const tenantId = '01473191-863b-4035-ac65-05782ca6159b';
    await this.prisma.$executeRaw`
      UPDATE scim_tokens SET is_active = false WHERE id = ${id}::uuid AND tenant_id = ${tenantId}::uuid
    `;
  }

  @Get('sync-logs')
  @ApiOperation({ summary: 'View SCIM sync operation history' })
  async syncLogs(@Query('page') page = '1', @Query('pageSize') pageSize = '50') {
    const tenantId = '01473191-863b-4035-ac65-05782ca6159b';
    const offset = (parseInt(page, 10) - 1) * parseInt(pageSize, 10);
    const logs = await this.prisma.$queryRaw`
      SELECT id, operation, resource_type, resource_id, status, error_message, created_at
      FROM scim_sync_log WHERE tenant_id = ${tenantId}::uuid
      ORDER BY created_at DESC LIMIT ${parseInt(pageSize, 10)} OFFSET ${offset}
    `;
    return { data: logs };
  }
}
