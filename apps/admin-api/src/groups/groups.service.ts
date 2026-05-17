import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { AddGroupMemberDto } from './dto/add-member.dto';
import { NestGroupDto } from './dto/nest-group.dto';
import { randomUUID } from 'crypto';

@Injectable()
export class GroupsService {
  private readonly logger = new Logger(GroupsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateGroupDto) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
    });

    return this.prisma.$transaction(async (tx) => {
      const group = await tx.group.create({
        data: {
          tenantId,
          name: dto.name,
          slug: dto.slug,
          description: dto.description,
          isManaged: dto.isManaged ?? false,
          metadata: dto.metadata ?? {},
        },
      });

      // Write group -> organization relation to authz outbox
      await tx.authzOutbox.create({
        data: {
          tenantId,
          storeId: tenant.openfgaStoreId ?? '',
          operation: 'write',
          tupleUser: `group:${group.id}#member`,
          tupleRelation: 'member',
          tupleObject: `organization:${tenantId}`,
          idempotencyKey: `group:${group.id}:create:${randomUUID()}`,
          source: 'admin-api',
        },
      });

      this.logger.log(`Group created: ${group.id} (${group.slug}) in tenant ${tenantId}`);
      return group;
    });
  }

  async findAll(
    tenantId: string,
    page = 1,
    pageSize = 20,
    search?: string,
  ) {
    const skip = (page - 1) * pageSize;
    const trimmed = search?.trim().slice(0, 200) || undefined;
    const where = {
      tenantId,
      deletedAt: null,
      ...(trimmed
        ? {
            OR: [
              { name: { contains: trimmed, mode: 'insensitive' as const } },
              { description: { contains: trimmed, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.group.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.group.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  async findOne(tenantId: string, id: string) {
    const group = await this.prisma.group.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        memberships: {
          include: {
            user: {
              select: { id: true, email: true, displayName: true },
            },
          },
        },
        parentOf: { include: { childGroup: true } },
        childOf: { include: { parentGroup: true } },
      },
    });

    if (!group) {
      throw new NotFoundException(`Group "${id}" not found`);
    }

    return group;
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);

    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
    });

    return this.prisma.$transaction(async (tx) => {
      const group = await tx.group.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      // Delete org membership tuple
      await tx.authzOutbox.create({
        data: {
          tenantId,
          storeId: tenant.openfgaStoreId ?? '',
          operation: 'delete',
          tupleUser: `group:${id}#member`,
          tupleRelation: 'member',
          tupleObject: `organization:${tenantId}`,
          idempotencyKey: `group:${id}:delete:${randomUUID()}`,
          source: 'admin-api',
        },
      });

      this.logger.log(`Group soft-deleted: ${id}`);
      return group;
    });
  }

  // --- Group Members ---

  async addMember(tenantId: string, groupId: string, dto: AddGroupMemberDto) {
    await this.findOne(tenantId, groupId);

    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
    });

    return this.prisma.$transaction(async (tx) => {
      const membership = await tx.groupMembership.create({
        data: {
          groupId,
          userId: dto.userId,
          role: dto.role ?? 'member',
        },
      });

      // Write user -> group member tuple
      await tx.authzOutbox.create({
        data: {
          tenantId,
          storeId: tenant.openfgaStoreId ?? '',
          operation: 'write',
          tupleUser: `user:${dto.userId}`,
          tupleRelation: 'member',
          tupleObject: `group:${groupId}`,
          idempotencyKey: `group-member:${groupId}:${dto.userId}:add:${randomUUID()}`,
          source: 'admin-api',
        },
      });

      this.logger.log(`User ${dto.userId} added to group ${groupId}`);
      return membership;
    });
  }

  async removeMember(tenantId: string, groupId: string, userId: string) {
    await this.findOne(tenantId, groupId);

    const membership = await this.prisma.groupMembership.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });

    if (!membership) {
      throw new NotFoundException(`User "${userId}" not in group "${groupId}"`);
    }

    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
    });

    return this.prisma.$transaction(async (tx) => {
      await tx.groupMembership.delete({
        where: { id: membership.id },
      });

      await tx.authzOutbox.create({
        data: {
          tenantId,
          storeId: tenant.openfgaStoreId ?? '',
          operation: 'delete',
          tupleUser: `user:${userId}`,
          tupleRelation: 'member',
          tupleObject: `group:${groupId}`,
          idempotencyKey: `group-member:${groupId}:${userId}:remove:${randomUUID()}`,
          source: 'admin-api',
        },
      });

      this.logger.log(`User ${userId} removed from group ${groupId}`);
      return { removed: true };
    });
  }

  // --- Group Nesting ---

  async nestGroup(tenantId: string, parentGroupId: string, dto: NestGroupDto) {
    await this.findOne(tenantId, parentGroupId);
    await this.findOne(tenantId, dto.childGroupId);

    if (parentGroupId === dto.childGroupId) {
      throw new ConflictException('Cannot nest a group under itself');
    }

    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
    });

    return this.prisma.$transaction(async (tx) => {
      const nesting = await tx.groupNesting.create({
        data: {
          parentGroupId,
          childGroupId: dto.childGroupId,
        },
      });

      // Write child#member -> parent member tuple for ReBAC inheritance
      await tx.authzOutbox.create({
        data: {
          tenantId,
          storeId: tenant.openfgaStoreId ?? '',
          operation: 'write',
          tupleUser: `group:${dto.childGroupId}#member`,
          tupleRelation: 'member',
          tupleObject: `group:${parentGroupId}`,
          idempotencyKey: `group-nest:${parentGroupId}:${dto.childGroupId}:add:${randomUUID()}`,
          source: 'admin-api',
        },
      });

      this.logger.log(`Group ${dto.childGroupId} nested under ${parentGroupId}`);
      return nesting;
    });
  }

  async unnestGroup(tenantId: string, parentGroupId: string, childGroupId: string) {
    const nesting = await this.prisma.groupNesting.findUnique({
      where: {
        parentGroupId_childGroupId: { parentGroupId, childGroupId },
      },
    });

    if (!nesting) {
      throw new NotFoundException('Group nesting not found');
    }

    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
    });

    return this.prisma.$transaction(async (tx) => {
      await tx.groupNesting.delete({ where: { id: nesting.id } });

      await tx.authzOutbox.create({
        data: {
          tenantId,
          storeId: tenant.openfgaStoreId ?? '',
          operation: 'delete',
          tupleUser: `group:${childGroupId}#member`,
          tupleRelation: 'member',
          tupleObject: `group:${parentGroupId}`,
          idempotencyKey: `group-nest:${parentGroupId}:${childGroupId}:remove:${randomUUID()}`,
          source: 'admin-api',
        },
      });

      this.logger.log(`Group ${childGroupId} unnested from ${parentGroupId}`);
      return { removed: true };
    });
  }
}
