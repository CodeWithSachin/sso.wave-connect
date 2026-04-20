// SSO Platform — Audit Log Types

import type { AuditActorType } from './enums.js';

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

export interface AuditQueryParams {
  tenantId: string;
  page: number;
  pageSize: number;
  actorId?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  startDate: string;
  endDate: string;
}

export interface AuditQueryResponse {
  data: AuditEntry[];
  total: number;
  page: number;
  pageSize: number;
}
