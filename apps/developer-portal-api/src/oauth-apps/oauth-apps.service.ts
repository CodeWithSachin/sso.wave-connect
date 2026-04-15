import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../shared/prisma/prisma.service';

@Injectable()
export class OAuthAppsService {
  private readonly logger = new Logger(OAuthAppsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, body: { name: string; redirect_uris: string[]; allowed_scopes?: string[] }) {
    const id = crypto.randomUUID();
    const clientId = `app_${randomBytes(16).toString('hex')}`;
    const clientSecret = randomBytes(32).toString('hex');
    const secretHash = createHash('sha256').update(clientSecret).digest('hex');
    const now = new Date();

    await this.prisma.$executeRaw`
      INSERT INTO oauth_clients (id, tenant_id, client_id, client_secret_hash, name, redirect_uris,
        allowed_scopes, is_first_party, is_public, require_pkce, require_consent, is_active, created_at, updated_at)
      VALUES (${id}::uuid, ${tenantId}::uuid, ${clientId}, ${secretHash}, ${body.name},
        ${body.redirect_uris}::text[], ${body.allowed_scopes ?? ['openid', 'profile', 'email']}::text[],
        false, false, true, true, true, ${now}, ${now})
    `;

    return { id, client_id: clientId, client_secret: clientSecret, name: body.name, redirect_uris: body.redirect_uris };
  }

  async list(tenantId: string, page = 1, pageSize = 20) {
    const offset = (page - 1) * pageSize;
    const apps = await this.prisma.$queryRaw`
      SELECT id, client_id, name, redirect_uris, allowed_scopes, is_active, created_at, updated_at
      FROM oauth_clients
      WHERE tenant_id = ${tenantId}::uuid AND deleted_at IS NULL AND is_first_party = false
      ORDER BY created_at DESC LIMIT ${pageSize} OFFSET ${offset}
    `;
    return { data: apps, page, pageSize };
  }

  async rotateSecret(tenantId: string, id: string) {
    const newSecret = randomBytes(32).toString('hex');
    const secretHash = createHash('sha256').update(newSecret).digest('hex');
    const result = await this.prisma.$executeRaw`
      UPDATE oauth_clients SET client_secret_hash = ${secretHash}, updated_at = NOW()
      WHERE id = ${id}::uuid AND tenant_id = ${tenantId}::uuid
    `;
    if (result === 0) throw new NotFoundException('OAuth app not found');
    return { client_secret: newSecret };
  }

  async delete(tenantId: string, id: string) {
    await this.prisma.$executeRaw`
      UPDATE oauth_clients SET deleted_at = NOW() WHERE id = ${id}::uuid AND tenant_id = ${tenantId}::uuid
    `;
  }
}
