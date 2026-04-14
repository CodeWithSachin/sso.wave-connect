import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { randomUUID } from 'crypto';

@Injectable()
export class MembershipsService {
  private readonly logger = new Logger(MembershipsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Invite a user to a tenant.
   * Creates the membership + writes an authz_outbox entry in a single transaction.
   */
  async invite(tenantId: string, dto: InviteMemberDto, inviterId?: string) {
    const role = dto.role ?? 'member';

    // Resolve user by email
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) {
      throw new NotFoundException(`User with email "${dto.email}" not found`);
    }

    // Check if already a member
    const existing = await this.prisma.membership.findUnique({
      where: { tenantId_userId: { tenantId, userId: user.id } },
    });
    if (existing && !existing.deletedAt) {
      throw new ConflictException('User is already a member of this tenant');
    }

    // Get tenant for OpenFGA store ID
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
    });

    return this.prisma.$transaction(async (tx) => {
      const membership = existing
        ? await tx.membership.update({
            where: { id: existing.id },
            data: {
              role,
              invitedBy: inviterId,
              joinedAt: new Date(),
              deletedAt: null,
            },
          })
        : await tx.membership.create({
            data: {
              userId: user.id,
              tenantId,
              role,
              invitedBy: inviterId,
              joinedAt: new Date(),
            },
          });

      // Write to authz outbox — the outbox worker will sync to OpenFGA
      await tx.authzOutbox.create({
        data: {
          tenantId,
          storeId: tenant.openfgaStoreId ?? '',
          operation: 'write',
          tupleUser: `user:${user.id}`,
          tupleRelation: role,
          tupleObject: `organization:${tenantId}`,
          idempotencyKey: `membership:${membership.id}:${role}:${randomUUID()}`,
          actorUserId: inviterId,
          source: 'admin-api',
        },
      });

      this.logger.log(
        `Membership created: user=${user.id} tenant=${tenantId} role=${role}`
      );
      return membership;
    });
  }

  async findAll(tenantId: string, page = 1, pageSize = 20) {
    const skip = (page - 1) * pageSize;
    const where = { tenantId, deletedAt: null };

    const [data, total] = await Promise.all([
      this.prisma.membership.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { id: true, email: true, displayName: true, avatarUrl: true },
          },
        },
      }),
      this.prisma.membership.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  async findOne(tenantId: string, id: string) {
    const membership = await this.prisma.membership.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        user: {
          select: { id: true, email: true, displayName: true, avatarUrl: true },
        },
      },
    });

    if (!membership) {
      throw new NotFoundException(`Membership "${id}" not found`);
    }

    return membership;
  }

  /**
   * Update a member's role.
   * Deletes the old tuple and writes the new one to authz_outbox.
   */
  async updateRole(tenantId: string, id: string, dto: UpdateRoleDto, actorId?: string) {
    const existing = await this.findOne(tenantId, id);

    if (existing.role === dto.role) {
      return existing; // No change needed
    }

    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
    });

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.membership.update({
        where: { id },
        data: { role: dto.role },
        include: {
          user: {
            select: { id: true, email: true, displayName: true, avatarUrl: true },
          },
        },
      });

      const storeId = tenant.openfgaStoreId ?? '';
      const batchId = randomUUID();

      // Delete old role tuple
      await tx.authzOutbox.create({
        data: {
          tenantId,
          storeId,
          operation: 'delete',
          tupleUser: `user:${existing.userId}`,
          tupleRelation: existing.role,
          tupleObject: `organization:${tenantId}`,
          idempotencyKey: `membership:${id}:del:${existing.role}:${batchId}`,
          actorUserId: actorId,
          source: 'admin-api',
        },
      });

      // Write new role tuple
      await tx.authzOutbox.create({
        data: {
          tenantId,
          storeId,
          operation: 'write',
          tupleUser: `user:${existing.userId}`,
          tupleRelation: dto.role,
          tupleObject: `organization:${tenantId}`,
          idempotencyKey: `membership:${id}:add:${dto.role}:${batchId}`,
          actorUserId: actorId,
          source: 'admin-api',
        },
      });

      this.logger.log(
        `Membership role updated: ${id} ${existing.role} -> ${dto.role}`
      );
      return updated;
    });
  }

  /**
   * Remove a membership.
   * Soft-deletes + writes delete tuple to authz_outbox.
   */
  async remove(tenantId: string, id: string, actorId?: string) {
    const existing = await this.findOne(tenantId, id);

    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
    });

    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.membership.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      await tx.authzOutbox.create({
        data: {
          tenantId,
          storeId: tenant.openfgaStoreId ?? '',
          operation: 'delete',
          tupleUser: `user:${existing.userId}`,
          tupleRelation: existing.role,
          tupleObject: `organization:${tenantId}`,
          idempotencyKey: `membership:${id}:remove:${randomUUID()}`,
          actorUserId: actorId,
          source: 'admin-api',
        },
      });

      this.logger.log(`Membership removed: ${id}`);
      return deleted;
    });
  }
}
