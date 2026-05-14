import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { UpdatePolicyDto } from './dto/update-policy.dto';

/**
 * Membership roles that may modify tenant security policies. Owner and admin
 * are the standard tenant-admin tier — billing_manager and readonly are not
 * permitted to flip security gates, and member is read-only by definition.
 */
const POLICY_WRITE_ROLES = new Set(['owner', 'admin']);

export interface AuditContext {
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class PoliciesService {
  private readonly logger = new Logger(PoliciesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get the security policy for a tenant.
   * Auto-creates one if it doesn't exist yet.
   */
  async findOne(tenantId: string) {
    let policy = await this.prisma.tenantPolicy.findFirst({
      where: { tenantId },
    });

    if (!policy) {
      // Auto-create default policy
      policy = await this.prisma.tenantPolicy.create({
        data: { tenantId },
      });
      this.logger.log(`Default policy created for tenant ${tenantId}`);
    }

    return policy;
  }

  /**
   * Update security policy with optimistic locking. Requires the caller to
   * hold an `owner` or `admin` membership in the tenant — defense in depth
   * on top of the frontend `manage_members` capability gate so a forged
   * session or an internal misroute can't silently flip MFA enforcement.
   *
   * Every successful change writes an audit row scoped to the tenant so
   * reviewers can see who toggled MFA enforcement, who relaxed the password
   * rules, etc. `actorId` is the admin user performing the change, pulled
   * from `@CurrentUser()` in the controller; `auditCtx` carries the request
   * IP + user-agent so the audit row is forensically useful.
   *
   * Audit-write failures are logged but do not roll back the policy update
   * (the policy row is the source of truth; audit is a downstream observation).
   */
  async update(
    tenantId: string,
    dto: UpdatePolicyDto,
    actorId: string,
    auditCtx: AuditContext = {},
  ) {
    await this.assertActorIsTenantAdmin(tenantId, actorId);

    const existing = await this.findOne(tenantId);

    if (existing.version !== dto.version) {
      throw new ConflictException(
        `Version conflict: expected ${dto.version}, found ${existing.version}`
      );
    }

    const { version: _version, ...updateData } = dto;

    const policy = await this.prisma.tenantPolicy.update({
      where: { id: existing.id },
      data: {
        ...updateData,
        version: { increment: 1 },
      },
    });

    const { oldValues, newValues } = diffPolicyFields(
      existing as Record<string, unknown>,
      policy as Record<string, unknown>,
      updateData,
    );
    if (Object.keys(newValues).length > 0) {
      await this.writeAuditLog({
        tenantId,
        actorId,
        actorIp: auditCtx.ip ?? null,
        actorUserAgent: auditCtx.userAgent ?? null,
        resourceId: policy.id,
        description: `tenant policy updated (v${existing.version} → v${policy.version})`,
        oldValues,
        newValues,
      });
    }

    this.logger.log(`Policy updated for tenant ${tenantId} (v${policy.version})`);
    return policy;
  }

  /**
   * Verify the acting user holds a role permitted to mutate tenant security
   * policy. A pending (joinedAt IS NULL) or soft-deleted membership does not
   * count — the user must have actually accepted the invitation.
   */
  private async assertActorIsTenantAdmin(
    tenantId: string,
    actorId: string,
  ): Promise<void> {
    const membership = await this.prisma.membership.findUnique({
      where: { tenantId_userId: { tenantId, userId: actorId } },
      select: { role: true, joinedAt: true, deletedAt: true },
    });
    if (
      !membership ||
      membership.deletedAt ||
      !membership.joinedAt ||
      !POLICY_WRITE_ROLES.has(membership.role)
    ) {
      throw new ForbiddenException(
        'Only tenant owners or admins can modify security policies',
      );
    }
  }

  /**
   * Append-only insert into the partitioned audit_logs table. Identical
   * shape to platform-admins.service writeAuditLog except this row is
   * tenant-scoped (real tenant_id, not the platform sentinel zero-UUID)
   * and carries actor IP + user-agent for forensics.
   *
   * Swallowed errors: a Prisma-side failure here must not unwind the
   * policy mutation that already committed. The structured logger keeps
   * the breadcrumb if the audit insert ever fails.
   */
  private async writeAuditLog(args: {
    tenantId: string;
    actorId: string;
    actorIp: string | null;
    actorUserAgent: string | null;
    resourceId: string;
    description: string;
    oldValues: Record<string, unknown>;
    newValues: Record<string, unknown>;
  }): Promise<void> {
    try {
      await this.prisma.$executeRaw`
        INSERT INTO audit_logs (
          tenant_id, actor_id, actor_type, actor_ip, actor_user_agent, action,
          resource_type, resource_id, description,
          old_values, new_values, metadata, created_at
        ) VALUES (
          ${args.tenantId}::uuid,
          ${args.actorId}::uuid,
          'user'::audit_actor_type,
          ${args.actorIp}::inet,
          ${args.actorUserAgent},
          ${'tenant_policy.updated'},
          'tenant_policy',
          ${args.resourceId},
          ${args.description},
          ${JSON.stringify(args.oldValues)}::jsonb,
          ${JSON.stringify(args.newValues)}::jsonb,
          '{}'::jsonb,
          NOW()
        )
      `;
    } catch (err) {
      this.logger.warn(
        `audit log write failed (policy update still persisted): tenant=${args.tenantId} resource=${args.resourceId} err=${(err as Error).message}`,
      );
    }
  }
}

/**
 * Compute the changed-fields diff between the pre-update row and the
 * patched row, restricted to the fields the caller actually attempted to
 * change. Returns parallel `oldValues` / `newValues` objects suitable for
 * the audit_logs JSONB columns.
 *
 * Restricting to the DTO's defined keys means we don't surface deltas on
 * server-generated columns (version, updated_at) or unrelated fields.
 *
 * TODO: if a future TenantPolicy field is a nested object (Record / Json),
 * extend `valuesEqual` to deep-compare. Today every field is a primitive
 * or a flat array, so the shallow comparison is sufficient.
 */
function diffPolicyFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  dtoKeys: Record<string, unknown>,
): { oldValues: Record<string, unknown>; newValues: Record<string, unknown> } {
  const oldValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};
  for (const key of Object.keys(dtoKeys)) {
    if (dtoKeys[key] === undefined) continue;
    const b = before[key];
    const a = after[key];
    if (!valuesEqual(b, a)) {
      oldValues[key] = b ?? null;
      newValues[key] = a ?? null;
    }
  }
  return { oldValues, newValues };
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }
  return false;
}
