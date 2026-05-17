import { Logger } from '@nestjs/common';
import type { SessionDbClient } from './session-cookie.guard.js';

/**
 * Fire an `audit_logs` row when an authorization guard rejects a request.
 *
 * Architecture-review Phase E: every guard rejection should leave a
 * forensic breadcrumb so an unexplained 403 in production can be traced
 * back to "which user, which route, which gate." Writes are best-effort —
 * an audit-side failure must NEVER poison the rejection itself, because
 * the rejection is the load-bearing behaviour. The caller throws the 403
 * regardless of whether this returns.
 *
 * The schema target is the partitioned `audit_logs` table already used by
 * policies.service, platform-admins.service, etc. Tenant id is the
 * platform-sentinel zero-UUID when no tenant context is available (a
 * platform-admin probing a tenant-scoped route, or an unauthenticated
 * caller — though the latter never reaches a capability gate).
 */
export interface GuardAuditArgs {
  action: 'rbac.capability_denied' | 'rbac.email_not_verified';
  actorId: string | null;
  tenantId: string | null;
  resourceType: string;
  resourceId: string;
  metadata?: Record<string, unknown>;
}

const PLATFORM_TENANT_SENTINEL = '00000000-0000-0000-0000-000000000000';

export async function emitGuardAuditEvent(
  db: SessionDbClient | null,
  args: GuardAuditArgs,
  log: Logger,
): Promise<void> {
  if (!db) return;
  if (!args.actorId) return; // unauthenticated callers don't reach guards
  try {
    const tenantId = args.tenantId ?? PLATFORM_TENANT_SENTINEL;
    const metadata = args.metadata ?? {};
    await db.$executeRaw`
      INSERT INTO audit_logs (
        tenant_id, actor_id, actor_type, action,
        resource_type, resource_id, description,
        old_values, new_values, metadata, created_at
      ) VALUES (
        ${tenantId}::uuid,
        ${args.actorId}::uuid,
        'user'::audit_actor_type,
        ${args.action},
        ${args.resourceType},
        ${args.resourceId},
        ${`guard rejected ${args.resourceType} ${args.resourceId}`},
        '{}'::jsonb,
        '{}'::jsonb,
        ${JSON.stringify(metadata)}::jsonb,
        NOW()
      )
    `;
  } catch (err) {
    // The 403 is what actually protects the system. A failed audit write
    // is a forensics gap, not a security one — log + move on.
    log.warn(
      `guard audit emit failed (action=${args.action}, actor=${
        args.actorId
      }): ${(err as Error).message}`,
    );
  }
}
