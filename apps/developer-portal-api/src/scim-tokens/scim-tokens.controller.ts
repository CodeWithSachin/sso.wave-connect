import { Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { RequireCapability, RequireVerifiedEmail, TenantId } from '@sso-platform/nestjs-auth';
import { PrismaService } from '../shared/prisma/prisma.service';

/**
 * SCIM token management. Capability gates (ADR-0002):
 *   - List + sync-logs: `view_developer_resources` (read tier: every active membership).
 *   - Create + revoke:   `manage_scim_tokens` (owner / admin only — these are
 *     long-lived provisioning credentials with broad write privileges).
 *
 * Before ADR-0002 the controller relied on `SessionCookieGuard` alone; any
 * tenant member could curl-create SCIM tokens, bypassing the client-side
 * nav filter. The decorators below close that gap.
 */
@ApiTags('SCIM Tokens')
@ApiBearerAuth()
@Controller('api/v1/scim-tokens')
export class ScimTokensController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  @RequireCapability('manage_scim_tokens')
  @RequireVerifiedEmail()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Generate a new SCIM provisioning token' })
  async create(@TenantId() tenantId: string) {
    const rawToken = randomBytes(32).toString('hex');
    const prefix = rawToken.substring(0, 8);
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const id = randomUUID();

    await this.prisma.$executeRaw`
      INSERT INTO scim_tokens (id, tenant_id, token_hash, token_prefix, is_active, created_at)
      VALUES (${id}::uuid, ${tenantId}::uuid, ${tokenHash}, ${prefix}, true, NOW())
    `;

    return { id, token: rawToken, prefix, message: 'Token shown only once. Store it securely.' };
  }

  @Get()
  @RequireCapability('view_developer_resources')
  @ApiOperation({ summary: 'List SCIM tokens' })
  async list(@TenantId() tenantId: string) {
    const tokens = await this.prisma.$queryRaw`
      SELECT id, token_prefix, is_active, last_used_at, created_at, expires_at
      FROM scim_tokens WHERE tenant_id = ${tenantId}::uuid
      ORDER BY created_at DESC
    `;
    return { data: tokens };
  }

  @Delete(':id')
  @RequireCapability('manage_scim_tokens')
  @RequireVerifiedEmail()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a SCIM token' })
  async revoke(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.prisma.$executeRaw`
      UPDATE scim_tokens SET is_active = false WHERE id = ${id}::uuid AND tenant_id = ${tenantId}::uuid
    `;
  }

  @Get('sync-logs')
  @RequireCapability('view_developer_resources')
  @ApiOperation({ summary: 'View SCIM sync operation history' })
  async syncLogs(
    @TenantId() tenantId: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '50',
  ) {
    const offset = (parseInt(page, 10) - 1) * parseInt(pageSize, 10);
    // scim_sync_log columns are external_id (IdP-side) and internal_id
    // (waveconnect uuid). The UI just wants one displayable id, so we
    // coalesce — preferring internal_id when present, else the external one.
    const logs = await this.prisma.$queryRaw`
      SELECT id, operation, resource_type,
             COALESCE(internal_id::text, external_id) AS resource_id,
             status, error_message, created_at
      FROM scim_sync_log WHERE tenant_id = ${tenantId}::uuid
      ORDER BY created_at DESC LIMIT ${parseInt(pageSize, 10)} OFFSET ${offset}
    `;
    return { data: logs };
  }
}
