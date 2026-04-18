import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { GrantPlatformAdminDto } from './dto/grant-platform-admin.dto';

@Injectable()
export class PlatformAdminsService {
  private readonly logger = new Logger(PlatformAdminsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Grant platform-admin privileges. If a row already exists (active or revoked),
   * we re-activate it rather than inserting a duplicate — platform_admins uses
   * user_id as PRIMARY KEY so a plain insert would conflict.
   */
  async grant(dto: GrantPlatformAdminDto, grantedBy: string) {
    const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!user || user.deletedAt) {
      throw new NotFoundException(`User with id "${dto.userId}" not found`);
    }

    const existing = await this.prisma.platformAdmin.findUnique({
      where: { userId: dto.userId },
    });

    if (existing && !existing.revokedAt) {
      throw new ConflictException(
        `User ${dto.userId} is already an active platform admin (role: ${existing.role})`,
      );
    }

    const result = await this.prisma.platformAdmin.upsert({
      where: { userId: dto.userId },
      create: {
        userId: dto.userId,
        role: dto.role,
        grantedBy,
        notes: dto.notes,
      },
      update: {
        role: dto.role,
        grantedBy,
        grantedAt: new Date(),
        revokedAt: null,
        notes: dto.notes,
      },
      include: { user: { select: { email: true } } },
    });

    await this.writeAuditLog({
      action: 'platform_admin.granted',
      actorId: grantedBy,
      resourceId: result.userId,
      description: `platform-admin granted: role=${result.role}`,
      newValues: { role: result.role, notes: result.notes },
    });

    this.logger.log(
      `platform-admin granted: user=${result.userId} role=${result.role} by=${grantedBy}`,
    );

    return this.toResponse(result);
  }

  async list() {
    const rows = await this.prisma.platformAdmin.findMany({
      where: { revokedAt: null },
      orderBy: { grantedAt: 'desc' },
      include: { user: { select: { email: true } } },
    });
    return {
      data: rows.map((r) => this.toResponse(r)),
      total: rows.length,
    };
  }

  async findOne(userId: string) {
    const row = await this.prisma.platformAdmin.findUnique({
      where: { userId },
      include: { user: { select: { email: true } } },
    });
    if (!row || row.revokedAt) {
      throw new NotFoundException(`Platform admin for user "${userId}" not found or revoked`);
    }
    return this.toResponse(row);
  }

  async revoke(userId: string, actingUserId: string) {
    const row = await this.prisma.platformAdmin.findUnique({ where: { userId } });
    if (!row || row.revokedAt) {
      throw new NotFoundException(`Platform admin for user "${userId}" not found or already revoked`);
    }
    if (userId === actingUserId) {
      // Prevent the last superadmin from locking themselves out by mistake.
      throw new ConflictException('You cannot revoke your own platform-admin grant');
    }

    const updated = await this.prisma.platformAdmin.update({
      where: { userId },
      data: { revokedAt: new Date() },
      include: { user: { select: { email: true } } },
    });

    await this.writeAuditLog({
      action: 'platform_admin.revoked',
      actorId: actingUserId,
      resourceId: userId,
      description: `platform-admin revoked: previousRole=${row.role}`,
      oldValues: { role: row.role },
    });

    this.logger.warn(
      `platform-admin revoked: user=${userId} previousRole=${row.role} by=${actingUserId}`,
    );

    return this.toResponse(updated);
  }

  /**
   * Write an immutable audit_logs row for a platform-admin action.
   *
   * Platform-admin grants are tenant-less by nature — the action affects
   * global platform state, not any individual tenant. `audit_logs.tenant_id`
   * is NOT NULL at the schema level (the column doesn't FK to tenants so
   * arbitrary UUIDs are accepted), so we use the zero-UUID sentinel to
   * mark "platform scope". Dashboards filtering by real tenant will see
   * these as unscoped and can surface them under a separate "platform
   * activity" tab.
   *
   * Errors swallow intentionally: an audit write failure must not poison
   * the surrounding grant/revoke, which is the source of truth. The
   * Logger.log/warn lines above preserve the breadcrumb even if the DB
   * insert fails.
   */
  private async writeAuditLog(args: {
    action: string;
    actorId: string;
    resourceId: string;
    description: string;
    oldValues?: Record<string, unknown>;
    newValues?: Record<string, unknown>;
  }): Promise<void> {
    try {
      await this.prisma.$executeRaw`
        INSERT INTO audit_logs (
          tenant_id, actor_id, actor_type, action,
          resource_type, resource_id, description,
          old_values, new_values, metadata, created_at
        ) VALUES (
          '00000000-0000-0000-0000-000000000000'::uuid,
          ${args.actorId}::uuid,
          'user'::audit_actor_type,
          ${args.action},
          'platform_admin',
          ${args.resourceId},
          ${args.description},
          ${args.oldValues ? JSON.stringify(args.oldValues) : null}::jsonb,
          ${args.newValues ? JSON.stringify(args.newValues) : null}::jsonb,
          '{}'::jsonb,
          NOW()
        )
      `;
    } catch (err) {
      this.logger.warn(
        `audit log write failed (grant/revoke still persisted): action=${args.action} resource=${args.resourceId} err=${(err as Error).message}`,
      );
    }
  }

  private toResponse(row: {
    userId: string;
    role: string;
    grantedAt: Date;
    grantedBy: string | null;
    revokedAt: Date | null;
    notes: string | null;
    user: { email: string };
  }) {
    return {
      userId: row.userId,
      email: row.user.email,
      role: row.role,
      grantedAt: row.grantedAt,
      grantedBy: row.grantedBy,
      revokedAt: row.revokedAt,
      notes: row.notes,
    };
  }
}
