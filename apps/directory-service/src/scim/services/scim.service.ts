import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CreateScimUserDto } from '../dto/scim-user.dto';
import { CreateScimGroupDto, ScimPatchOperation } from '../dto/scim-group.dto';
import { parseScimFilter, mapScimUserAttribute } from '../helpers/scim-filter';

interface UserRow {
  id: string;
  email: string;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  status: string;
  external_id: string | null;
  created_at: Date;
  updated_at: Date;
}

interface GroupRow {
  id: string;
  name: string;
  external_id: string | null;
  created_at: Date;
  updated_at: Date;
}

interface GroupMemberRow {
  user_id: string;
  display_name: string;
}

@Injectable()
export class ScimService {
  private readonly logger = new Logger(ScimService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── USERS ────────────────────────────────────────────

  async listUsers(
    tenantId: string,
    startIndex = 1,
    count = 100,
    filter?: string,
  ) {
    const offset = Math.max(0, startIndex - 1);

    let whereClause = `m.tenant_id = $1::uuid AND u.deleted_at IS NULL`;
    const params: unknown[] = [tenantId];

    const parsed = parseScimFilter(filter);
    if (parsed) {
      const col = mapScimUserAttribute(parsed.attribute);
      if (col && parsed.operator === 'eq') {
        whereClause += ` AND u.${col} = $3`;
        params.push(count, parsed.value);
      } else {
        params.push(count);
      }
    } else {
      params.push(count);
    }

    const users = await this.prisma.$queryRawUnsafe<UserRow[]>(
      `SELECT u.id, u.email, u.display_name, u.first_name, u.last_name,
              u.status, u.metadata->>'external_id' AS external_id, u.created_at, u.updated_at
       FROM users u
       JOIN memberships m ON m.user_id = u.id
       WHERE ${whereClause}
       ORDER BY u.created_at DESC
       LIMIT $2 OFFSET ${offset}`,
      ...params,
    );

    const totalResult = await this.prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*) as count FROM users u
       JOIN memberships m ON m.user_id = u.id
       WHERE ${whereClause}`,
      ...params.slice(0, params.length === 3 ? 3 : 1),
    );

    const total = Number(totalResult[0]?.count ?? 0);

    return { users, total, startIndex, count };
  }

  async getUserById(tenantId: string, userId: string): Promise<UserRow> {
    const rows = await this.prisma.$queryRaw<UserRow[]>`
      SELECT u.id, u.email, u.display_name, u.first_name, u.last_name,
             u.status, u.metadata->>'external_id' AS external_id, u.created_at, u.updated_at
      FROM users u
      JOIN memberships m ON m.user_id = u.id
      WHERE u.id = ${userId}::uuid AND m.tenant_id = ${tenantId}::uuid AND u.deleted_at IS NULL
      LIMIT 1
    `;
    if (!rows.length) throw new NotFoundException('User not found');
    return rows[0];
  }

  async provisionUser(
    tenantId: string,
    dto: CreateScimUserDto,
  ): Promise<UserRow> {
    const primaryEmail =
      dto.emails?.find((e) => e.primary)?.value ??
      dto.emails?.[0]?.value ??
      dto.userName;

    // Check for existing user
    const existing = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT u.id FROM users u
      JOIN memberships m ON m.user_id = u.id
      WHERE u.email = ${primaryEmail} AND m.tenant_id = ${tenantId}::uuid AND u.deleted_at IS NULL
      LIMIT 1
    `;
    if (existing.length > 0) {
      throw new ConflictException('User already exists in this tenant');
    }

    const userId = randomUUID();
    const membershipId = randomUUID();
    const now = new Date();
    const metadata = dto.externalId
      ? JSON.stringify({ external_id: dto.externalId })
      : '{}';

    // Transaction: create user + membership + authz outbox tuple
    await this.prisma.$transaction([
      this.prisma.$executeRaw`
        INSERT INTO users (id, email, display_name, first_name, last_name, status, metadata, created_at, updated_at)
        VALUES (
          ${userId}::uuid,
          ${primaryEmail},
          ${dto.displayName},
          ${dto.name?.givenName ?? null},
          ${dto.name?.familyName ?? null},
          ${dto.active === false ? 'inactive' : 'active'},
          ${metadata}::jsonb,
          ${now},
          ${now}
        )
      `,
      this.prisma.$executeRaw`
        INSERT INTO memberships (id, user_id, tenant_id, role, joined_at, created_at, updated_at)
        VALUES (${membershipId}::uuid, ${userId}::uuid, ${tenantId}::uuid, 'member', ${now}, ${now}, ${now})
      `,
      // Authz outbox: OpenFGA will pick this up
      this.prisma.$executeRaw`
        INSERT INTO authz_outbox (id, operation, tuple_user, tuple_relation, tuple_object, tenant_id, created_at)
        VALUES (
          ${randomUUID()}::uuid,
          'write',
          ${'user:' + userId},
          'member',
          ${'organization:' + tenantId},
          ${tenantId}::uuid,
          ${now}
        )
      `,
    ]);

    this.logger.log(
      `SCIM: Provisioned user ${primaryEmail} in tenant ${tenantId}`,
    );

    return this.getUserById(tenantId, userId);
  }

  async deprovisionUser(tenantId: string, userId: string): Promise<void> {
    const now = new Date();

    await this.prisma.$transaction([
      // Soft-delete user
      this.prisma.$executeRaw`
        UPDATE users SET status = 'inactive', deleted_at = ${now}, updated_at = ${now}
        WHERE id = ${userId}::uuid
      `,
      // Soft-delete membership
      this.prisma.$executeRaw`
        UPDATE memberships SET deleted_at = ${now}, updated_at = ${now}
        WHERE user_id = ${userId}::uuid AND tenant_id = ${tenantId}::uuid
      `,
      // Revoke sessions
      this.prisma.$executeRaw`
        UPDATE sessions SET status = 'revoked', revoked_at = ${now}
        WHERE user_id = ${userId}::uuid AND tenant_id = ${tenantId}::uuid AND status = 'active'
      `,
      // Authz outbox: remove tuple
      this.prisma.$executeRaw`
        INSERT INTO authz_outbox (id, operation, tuple_user, tuple_relation, tuple_object, tenant_id, created_at)
        VALUES (
          ${randomUUID()}::uuid,
          'delete',
          ${'user:' + userId},
          'member',
          ${'organization:' + tenantId},
          ${tenantId}::uuid,
          ${now}
        )
      `,
    ]);

    this.logger.log(
      `SCIM: Deprovisioned user ${userId} from tenant ${tenantId}`,
    );
  }

  async replaceUser(
    tenantId: string,
    userId: string,
    dto: CreateScimUserDto,
  ): Promise<UserRow> {
    const primaryEmail =
      dto.emails?.find((e) => e.primary)?.value ??
      dto.emails?.[0]?.value ??
      dto.userName;
    const now = new Date();
    const metadata = dto.externalId
      ? JSON.stringify({ external_id: dto.externalId })
      : '{}';

    const result = await this.prisma.$executeRaw`
      UPDATE users SET
        email = ${primaryEmail},
        display_name = ${dto.displayName},
        first_name = ${dto.name?.givenName ?? null},
        last_name = ${dto.name?.familyName ?? null},
        status = ${dto.active === false ? 'inactive' : 'active'},
        metadata = ${metadata}::jsonb,
        updated_at = ${now}
      WHERE id = ${userId}::uuid
    `;

    if (result === 0) throw new NotFoundException('User not found');

    return this.getUserById(tenantId, userId);
  }

  // ─── GROUPS ───────────────────────────────────────────

  async listGroups(tenantId: string, startIndex = 1, count = 100) {
    const offset = Math.max(0, startIndex - 1);

    const groups = await this.prisma.$queryRaw<GroupRow[]>`
      SELECT id, name, metadata->>'external_id' AS external_id, created_at, updated_at
      FROM groups
      WHERE tenant_id = ${tenantId}::uuid AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT ${count} OFFSET ${offset}
    `;

    const totalResult = await this.prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM groups
      WHERE tenant_id = ${tenantId}::uuid AND deleted_at IS NULL
    `;

    const total = Number(totalResult[0]?.count ?? 0);
    return { groups, total, startIndex, count };
  }

  async getGroupById(
    tenantId: string,
    groupId: string,
  ): Promise<{ group: GroupRow; members: GroupMemberRow[] }> {
    const rows = await this.prisma.$queryRaw<GroupRow[]>`
      SELECT id, name, metadata->>'external_id' AS external_id, created_at, updated_at
      FROM groups
      WHERE id = ${groupId}::uuid AND tenant_id = ${tenantId}::uuid AND deleted_at IS NULL
      LIMIT 1
    `;
    if (!rows.length) throw new NotFoundException('Group not found');

    const members = await this.prisma.$queryRaw<GroupMemberRow[]>`
      SELECT gm.user_id, u.display_name
      FROM group_memberships gm
      JOIN users u ON u.id = gm.user_id
      WHERE gm.group_id = ${groupId}::uuid
    `;

    return { group: rows[0], members };
  }

  async provisionGroup(
    tenantId: string,
    dto: CreateScimGroupDto,
  ): Promise<{ group: GroupRow; members: GroupMemberRow[] }> {
    const groupId = randomUUID();
    const now = new Date();
    const metadata = dto.externalId
      ? JSON.stringify({ external_id: dto.externalId })
      : '{}';

    await this.prisma.$executeRaw`
      INSERT INTO groups (id, tenant_id, name, source, is_managed, metadata, created_at, updated_at)
      VALUES (${groupId}::uuid, ${tenantId}::uuid, ${dto.displayName}, 'scim', true, ${metadata}::jsonb, ${now}, ${now})
    `;

    // Add members if provided
    if (dto.members?.length) {
      for (const member of dto.members) {
        await this.prisma.$executeRaw`
          INSERT INTO group_memberships (group_id, user_id, created_at)
          VALUES (${groupId}::uuid, ${member.value}::uuid, ${now})
          ON CONFLICT DO NOTHING
        `;
      }
    }

    this.logger.log(
      `SCIM: Provisioned group "${dto.displayName}" in tenant ${tenantId}`,
    );

    return this.getGroupById(tenantId, groupId);
  }

  async patchGroup(
    tenantId: string,
    groupId: string,
    operations: ScimPatchOperation[],
  ): Promise<{ group: GroupRow; members: GroupMemberRow[] }> {
    const now = new Date();

    for (const op of operations) {
      if (op.path === 'displayName' && op.op === 'replace') {
        await this.prisma.$executeRaw`
          UPDATE groups SET name = ${String(op.value)}, updated_at = ${now}
          WHERE id = ${groupId}::uuid AND tenant_id = ${tenantId}::uuid
        `;
      } else if (op.path === 'members' && op.op === 'add') {
        const members = op.value as { value: string }[];
        for (const m of members) {
          await this.prisma.$executeRaw`
            INSERT INTO group_memberships (group_id, user_id, created_at)
            VALUES (${groupId}::uuid, ${m.value}::uuid, ${now})
            ON CONFLICT DO NOTHING
          `;
        }
      } else if (op.path === 'members' && op.op === 'remove') {
        const members = op.value as { value: string }[];
        for (const m of members) {
          await this.prisma.$executeRaw`
            DELETE FROM group_memberships
            WHERE group_id = ${groupId}::uuid AND user_id = ${m.value}::uuid
          `;
        }
      } else if (
        op.path?.startsWith('members[value eq "') &&
        op.op === 'remove'
      ) {
        // Handle Okta-style: members[value eq "userId"]
        const match = op.path.match(/members\[value eq "(.+)"\]/);
        if (match) {
          await this.prisma.$executeRaw`
            DELETE FROM group_memberships
            WHERE group_id = ${groupId}::uuid AND user_id = ${match[1]}::uuid
          `;
        }
      }
    }

    return this.getGroupById(tenantId, groupId);
  }
}
