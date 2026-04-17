import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../shared/prisma/prisma.service';

interface ApiKeyRow {
  id: string;
  tenant_id: string;
  user_id: string;
  name: string;
  key_prefix: string;
  status: string;
  scopes: string[];
  allowed_ips: string[] | null;
  rate_limit_per_min: number;
  expires_at: Date | null;
  last_used_at: Date | null;
  created_at: Date;
}

interface ApiKeyUsageRow {
  date: Date;
  request_count: number;
  error_count: number;
  avg_latency_ms: number;
  p99_latency_ms: number;
  bandwidth_bytes: number;
}

@Injectable()
export class ApiKeysService {
  private readonly logger = new Logger(ApiKeysService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(
    tenantId: string,
    userId: string,
    name: string,
    scopes: string[] = ['read'],
    rateLimitPerMin = 1000,
    expiresAt?: Date,
  ) {
    // Generate a cryptographically random API key
    const rawKey = randomBytes(32).toString('hex'); // 64-char hex string
    const prefix = rawKey.substring(0, 8);
    const keyHash = createHash('sha256').update(rawKey).digest('hex');

    const id = crypto.randomUUID();
    const now = new Date();

    await this.prisma.$executeRaw`
      INSERT INTO api_keys (id, tenant_id, user_id, name, key_prefix, key_hash, status, scopes, rate_limit_per_min, expires_at, created_at)
      VALUES (
        ${id}::uuid, ${tenantId}::uuid, ${userId}::uuid, ${name},
        ${prefix}, ${keyHash}, 'active', ${scopes}::text[],
        ${rateLimitPerMin}, ${expiresAt ?? null}, ${now}
      )
    `;

    this.logger.log(`API key created: ${prefix}... for tenant ${tenantId}`);

    // Return the full key ONLY on creation — never again
    return {
      id,
      name,
      key: rawKey, // Shown once, then discarded
      prefix,
      scopes,
      rate_limit_per_min: rateLimitPerMin,
      expires_at: expiresAt,
      created_at: now,
    };
  }

  async list(tenantId: string, page = 1, pageSize = 20) {
    const offset = (page - 1) * pageSize;

    const keys = await this.prisma.$queryRaw<ApiKeyRow[]>`
      SELECT id, tenant_id, user_id, name, key_prefix, status, scopes,
             allowed_ips, rate_limit_per_min, expires_at, last_used_at, created_at
      FROM api_keys
      WHERE tenant_id = ${tenantId}::uuid
      ORDER BY created_at DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `;

    const totalResult = await this.prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM api_keys
      WHERE tenant_id = ${tenantId}::uuid
    `;

    return {
      data: keys,
      total: Number(totalResult[0]?.count ?? 0),
      page,
      pageSize,
    };
  }

  async getById(tenantId: string, id: string) {
    const rows = await this.prisma.$queryRaw<ApiKeyRow[]>`
      SELECT id, tenant_id, user_id, name, key_prefix, status, scopes,
             allowed_ips, rate_limit_per_min, expires_at, last_used_at, created_at
      FROM api_keys
      WHERE id = ${id}::uuid AND tenant_id = ${tenantId}::uuid
      LIMIT 1
    `;
    if (!rows.length) throw new NotFoundException('API key not found');
    return rows[0];
  }

  async revoke(tenantId: string, id: string) {
    const now = new Date();
    const result = await this.prisma.$executeRaw`
      UPDATE api_keys SET status = 'revoked', revoked_at = ${now}
      WHERE id = ${id}::uuid AND tenant_id = ${tenantId}::uuid AND status = 'active'
    `;
    if (result === 0) throw new NotFoundException('API key not found or already revoked');
  }

  async getUsage(tenantId: string, keyId: string, days = 30) {
    // Verify key belongs to tenant
    await this.getById(tenantId, keyId);

    const rows = await this.prisma.$queryRaw<ApiKeyUsageRow[]>`
      SELECT date, request_count, error_count, avg_latency_ms, p99_latency_ms, bandwidth_bytes
      FROM api_key_usage
      WHERE api_key_id = ${keyId}::uuid AND date >= NOW() - INTERVAL '1 day' * ${days}
      ORDER BY date DESC
    `;

    return rows;
  }
}
