import { describe, expect, it, beforeEach, vi } from 'vitest';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { PoliciesService } from './policies.service';

/**
 * Minimal Prisma double — just the bits PoliciesService touches. Returning
 * vi.fn() instances lets each test assert how the service interacted with
 * the DB layer without spinning up Postgres.
 */
function makePrismaMock() {
  return {
    tenantPolicy: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    membership: {
      findUnique: vi.fn(),
    },
    $executeRaw: vi.fn().mockResolvedValue(1),
  };
}

const baseExisting = {
  id: 'p-1',
  tenantId: 't-1',
  passwordMinLength: 8,
  passwordRequireUpper: true,
  passwordRequireLower: true,
  passwordRequireNumber: true,
  passwordRequireSymbol: false,
  passwordRequireMfa: false,
  allowedMfaMethods: ['totp', 'webauthn'],
  sessionMaxAgeHours: 24,
  idleTimeoutMinutes: 30,
  ipAllowlist: [],
  allowedEmailDomains: [],
  requireSso: false,
  maxSessionsPerUser: 5,
  passwordHistoryCount: 0,
  lockoutThreshold: 5,
  lockoutDurationMin: 15,
  version: 1,
};

const adminMembership = {
  role: 'admin' as const,
  joinedAt: new Date('2026-01-01'),
  deletedAt: null,
};

describe('PoliciesService.update', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let svc: PoliciesService;

  beforeEach(() => {
    prisma = makePrismaMock();
    prisma.membership.findUnique.mockResolvedValue(adminMembership);
    svc = new PoliciesService(prisma as unknown as never);
  });

  describe('authorization', () => {
    it('rejects callers with no membership in the tenant', async () => {
      prisma.membership.findUnique.mockResolvedValue(null);
      await expect(
        svc.update('t-1', { version: 1, passwordRequireMfa: true }, 'actor-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.tenantPolicy.update).not.toHaveBeenCalled();
    });

    it('rejects callers whose membership is pending (no joinedAt)', async () => {
      prisma.membership.findUnique.mockResolvedValue({
        role: 'admin',
        joinedAt: null,
        deletedAt: null,
      });
      await expect(
        svc.update('t-1', { version: 1, passwordRequireMfa: true }, 'actor-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects callers whose membership is soft-deleted', async () => {
      prisma.membership.findUnique.mockResolvedValue({
        role: 'owner',
        joinedAt: new Date('2026-01-01'),
        deletedAt: new Date('2026-02-01'),
      });
      await expect(
        svc.update('t-1', { version: 1, passwordRequireMfa: true }, 'actor-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects member, billing_manager, readonly roles', async () => {
      for (const role of ['member', 'billing_manager', 'readonly']) {
        prisma.membership.findUnique.mockResolvedValue({
          role,
          joinedAt: new Date('2026-01-01'),
          deletedAt: null,
        });
        await expect(
          svc.update('t-1', { version: 1, passwordRequireMfa: true }, 'actor-1'),
        ).rejects.toBeInstanceOf(ForbiddenException);
      }
      expect(prisma.tenantPolicy.update).not.toHaveBeenCalled();
    });

    it('allows owner role', async () => {
      prisma.membership.findUnique.mockResolvedValue({
        role: 'owner',
        joinedAt: new Date('2026-01-01'),
        deletedAt: null,
      });
      prisma.tenantPolicy.findFirst.mockResolvedValue(baseExisting);
      prisma.tenantPolicy.update.mockResolvedValue({ ...baseExisting, version: 2 });

      await expect(
        svc.update('t-1', { version: 1, passwordRequireMfa: true }, 'actor-1'),
      ).resolves.toBeTruthy();
    });
  });

  describe('happy path', () => {
    it('rejects mismatched version with ConflictException', async () => {
      prisma.tenantPolicy.findFirst.mockResolvedValue({ ...baseExisting, version: 3 });

      await expect(
        svc.update('t-1', { version: 1, passwordRequireMfa: true }, 'actor-1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.tenantPolicy.update).not.toHaveBeenCalled();
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
    });

    it('increments version, writes audit row with only changed fields in the diff', async () => {
      prisma.tenantPolicy.findFirst.mockResolvedValue(baseExisting);
      prisma.tenantPolicy.update.mockResolvedValue({
        ...baseExisting,
        passwordRequireMfa: true,
        allowedMfaMethods: ['totp', 'webauthn'],
        version: 2,
      });

      const result = await svc.update(
        't-1',
        {
          version: 1,
          passwordRequireMfa: true,
          allowedMfaMethods: ['totp', 'webauthn'],
        },
        'actor-1',
      );

      expect(result.version).toBe(2);
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
      const values = prisma.$executeRaw.mock.calls[0].slice(1);
      const stringified = values.map(String).join('|');
      expect(stringified).toContain('t-1');
      expect(stringified).toContain('actor-1');
      expect(stringified).toContain('tenant_policy.updated');
      expect(stringified).toContain('passwordRequireMfa');
      const oldVals = values.find(
        (v): v is string =>
          typeof v === 'string' && v.startsWith('{') && v.includes('passwordRequireMfa'),
      );
      expect(oldVals).toBeDefined();
      expect(oldVals).not.toContain('allowedMfaMethods');
    });

    it('records actor IP and user-agent in the audit row when provided', async () => {
      prisma.tenantPolicy.findFirst.mockResolvedValue(baseExisting);
      prisma.tenantPolicy.update.mockResolvedValue({
        ...baseExisting,
        passwordRequireMfa: true,
        version: 2,
      });

      await svc.update(
        't-1',
        { version: 1, passwordRequireMfa: true },
        'actor-1',
        { ip: '203.0.113.42', userAgent: 'Mozilla/5.0' },
      );

      const values = prisma.$executeRaw.mock.calls[0].slice(1);
      expect(values).toContain('203.0.113.42');
      expect(values).toContain('Mozilla/5.0');
    });

    it('passes NULL for actor IP / UA when audit context is empty', async () => {
      prisma.tenantPolicy.findFirst.mockResolvedValue(baseExisting);
      prisma.tenantPolicy.update.mockResolvedValue({
        ...baseExisting,
        passwordRequireMfa: true,
        version: 2,
      });

      await svc.update(
        't-1',
        { version: 1, passwordRequireMfa: true },
        'actor-1',
      );

      const values = prisma.$executeRaw.mock.calls[0].slice(1);
      // Two nulls in a row at the IP + UA positions.
      const nullCount = values.filter((v) => v === null).length;
      expect(nullCount).toBeGreaterThanOrEqual(2);
    });

    it('does not write an audit row when the patch is a no-op', async () => {
      prisma.tenantPolicy.findFirst.mockResolvedValue(baseExisting);
      prisma.tenantPolicy.update.mockResolvedValue({ ...baseExisting, version: 2 });

      await svc.update('t-1', { version: 1, passwordRequireMfa: false }, 'actor-1');

      expect(prisma.tenantPolicy.update).toHaveBeenCalled();
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
    });

    it('swallows audit-log failures so the policy update still returns', async () => {
      prisma.tenantPolicy.findFirst.mockResolvedValue(baseExisting);
      prisma.tenantPolicy.update.mockResolvedValue({
        ...baseExisting,
        passwordRequireMfa: true,
        version: 2,
      });
      prisma.$executeRaw.mockRejectedValueOnce(new Error('partition missing'));

      const result = await svc.update(
        't-1',
        { version: 1, passwordRequireMfa: true },
        'actor-1',
      );

      expect(result.version).toBe(2);
    });

    it('diffs array fields by element-wise comparison', async () => {
      prisma.tenantPolicy.findFirst.mockResolvedValue({
        ...baseExisting,
        allowedMfaMethods: ['totp'],
      });
      prisma.tenantPolicy.update.mockResolvedValue({
        ...baseExisting,
        allowedMfaMethods: ['totp', 'webauthn'],
        version: 2,
      });

      await svc.update(
        't-1',
        { version: 1, allowedMfaMethods: ['totp', 'webauthn'] },
        'actor-1',
      );

      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    });
  });
});
