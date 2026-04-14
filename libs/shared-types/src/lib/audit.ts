// SSO Platform — Audit Log Types (scaffold)

import type { AuditActorType } from './enums';

export interface AuditEntry {
  id: string;
  tenantId: string;
  actorId?: string;
  actorType: AuditActorType;
  actorIp?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  description?: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  metadata: Record<string, unknown>;
  requestId?: string;
  createdAt: string;
}
