import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../shared/prisma/prisma.service';

@Injectable()
export class OAuthAppsService {
  private readonly logger = new Logger(OAuthAppsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, userId: string, body: { name: string; redirect_uris: string[]; allowed_scopes?: string[] }) {
    const id = crypto.randomUUID();
    const clientId = `app_${randomBytes(16).toString('hex')}`;
    const clientSecret = randomBytes(32).toString('hex');
    const secretHash = createHash('sha256').update(clientSecret).digest('hex');
    const now = new Date();

    // Phase 4: insert + owner-tuple outbox row in one transaction so the
    // OpenFGA grant is durable iff the oauth_clients insert lands.
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO oauth_clients (id, tenant_id, client_id, client_secret_hash, name, redirect_uris,
          allowed_scopes, is_first_party, is_public, require_pkce, require_consent, is_active, created_at, updated_at)
        VALUES (${id}::uuid, ${tenantId}::uuid, ${clientId}, ${secretHash}, ${body.name},
          ${body.redirect_uris}::text[], ${body.allowed_scopes ?? ['openid', 'profile', 'email']}::text[],
          false, false, true, true, true, ${now}, ${now})
      `;
      const tenantRow = await tx.$queryRaw<{ openfga_store_id: string | null }[]>`
        SELECT openfga_store_id FROM tenants WHERE id = ${tenantId}::uuid LIMIT 1
      `;
      const storeId = tenantRow[0]?.openfga_store_id ?? '';
      await tx.$executeRaw`
        INSERT INTO authz_outbox (
          tenant_id, store_id, operation, tuple_user, tuple_relation, tuple_object,
          idempotency_key, actor_user_id, source
        ) VALUES (
          ${tenantId}::uuid, ${storeId}, 'write',
          ${'user:' + userId}, 'owner', ${'oauth_app:' + id},
          ${'oauth_app:' + id + ':owner:create'},
          ${userId}::uuid, 'developer-portal-api'
        )
      `;
    });

    return { id, client_id: clientId, client_secret: clientSecret, name: body.name, redirect_uris: body.redirect_uris };
  }

  async list(tenantId: string, page = 1, pageSize = 20, search?: string) {
    const offset = (page - 1) * pageSize;
    const trimmed = search?.trim().slice(0, 200) || undefined;
    const searchClause = trimmed
      ? Prisma.sql`AND (name ILIKE ${'%' + trimmed + '%'} OR client_id ILIKE ${'%' + trimmed + '%'})`
      : Prisma.empty;
    const apps = await this.prisma.$queryRaw`
      SELECT id, client_id, name, redirect_uris, allowed_scopes, is_active, created_at, updated_at
      FROM oauth_clients
      WHERE tenant_id = ${tenantId}::uuid AND deleted_at IS NULL AND is_first_party = false
      ${searchClause}
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

  /**
   * Update mutable fields on an OAuth app. Only `name`, `redirect_uris`, and
   * `allowed_scopes` are editable — client_id, client_secret_hash, and the
   * is_first_party / is_public flags are immutable post-creation (rotating
   * secrets goes through rotateSecret instead).
   *
   * Each field is conditionally updated; passing only `name` won't blank
   * out redirect URIs. NotFound if no row matches.
   */
  async update(
    tenantId: string,
    id: string,
    body: { name?: string; redirect_uris?: string[]; allowed_scopes?: string[] },
  ) {
    // Build a partial UPDATE so we don't touch fields the caller omitted.
    // Prisma's $executeRaw can't conditionally include fragments cleanly,
    // so we issue separate statements; each is a no-op if the field is
    // absent. All run inside a transaction to keep the change atomic.
    await this.prisma.$transaction(async (tx) => {
      if (typeof body.name === 'string') {
        await tx.$executeRaw`
          UPDATE oauth_clients SET name = ${body.name}, updated_at = NOW()
          WHERE id = ${id}::uuid AND tenant_id = ${tenantId}::uuid AND deleted_at IS NULL
        `;
      }
      if (Array.isArray(body.redirect_uris)) {
        await tx.$executeRaw`
          UPDATE oauth_clients SET redirect_uris = ${body.redirect_uris}::text[], updated_at = NOW()
          WHERE id = ${id}::uuid AND tenant_id = ${tenantId}::uuid AND deleted_at IS NULL
        `;
      }
      if (Array.isArray(body.allowed_scopes)) {
        await tx.$executeRaw`
          UPDATE oauth_clients SET allowed_scopes = ${body.allowed_scopes}::text[], updated_at = NOW()
          WHERE id = ${id}::uuid AND tenant_id = ${tenantId}::uuid AND deleted_at IS NULL
        `;
      }
    });

    const rows = await this.prisma.$queryRaw<unknown[]>`
      SELECT id, client_id, name, redirect_uris, allowed_scopes, is_active, created_at, updated_at
      FROM oauth_clients
      WHERE id = ${id}::uuid AND tenant_id = ${tenantId}::uuid AND deleted_at IS NULL
    `;
    if (rows.length === 0) throw new NotFoundException('OAuth app not found');
    return rows[0];
  }
}
