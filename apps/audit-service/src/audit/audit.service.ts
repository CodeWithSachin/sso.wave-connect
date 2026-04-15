import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';

export interface AuditQueryParams {
  tenantId: string;
  page: number;
  pageSize: number;
  actorId?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  startDate: string; // ISO 8601 — required for partition pruning
  endDate: string;   // ISO 8601 — required for partition pruning
}

interface AuditLogRow {
  id: string;
  tenant_id: string;
  actor_id: string | null;
  actor_type: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async query(params: AuditQueryParams) {
    if (!params.startDate || !params.endDate) {
      throw new BadRequestException(
        'startDate and endDate are required for audit log queries (partition pruning)',
      );
    }

    const offset = (params.page - 1) * params.pageSize;

    // Build dynamic WHERE clause
    // Always include date range for partition pruning on audit_logs
    const conditions: string[] = [
      `tenant_id = $1::uuid`,
      `created_at >= $2::timestamptz`,
      `created_at <= $3::timestamptz`,
    ];
    const queryParams: unknown[] = [
      params.tenantId,
      params.startDate,
      params.endDate,
    ];

    let paramIdx = 4;
    if (params.actorId) {
      conditions.push(`actor_id = $${paramIdx}::uuid`);
      queryParams.push(params.actorId);
      paramIdx++;
    }
    if (params.action) {
      conditions.push(`action = $${paramIdx}`);
      queryParams.push(params.action);
      paramIdx++;
    }
    if (params.resourceType) {
      conditions.push(`resource_type = $${paramIdx}`);
      queryParams.push(params.resourceType);
      paramIdx++;
    }
    if (params.resourceId) {
      conditions.push(`resource_id = $${paramIdx}`);
      queryParams.push(params.resourceId);
      paramIdx++;
    }

    const whereClause = conditions.join(' AND ');

    const logs = await this.prisma.$queryRawUnsafe<AuditLogRow[]>(
      `SELECT id, tenant_id, actor_id, actor_type, action, resource_type, resource_id,
              ip_address, user_agent, metadata, created_at
       FROM audit_logs
       WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT ${params.pageSize} OFFSET ${offset}`,
      ...queryParams,
    );

    const totalResult = await this.prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*) as count FROM audit_logs WHERE ${whereClause}`,
      ...queryParams,
    );

    const total = Number(totalResult[0]?.count ?? 0);

    return {
      data: logs,
      total,
      page: params.page,
      pageSize: params.pageSize,
    };
  }
}
