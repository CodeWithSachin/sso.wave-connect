import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { RequireVerifiedEmailGuard } from './require-verified-email.guard.js';

type FakeRequest = {
  user?: { id?: string; emailVerified?: boolean };
};

function ctxFor(req: FakeRequest, metadata: boolean | undefined) {
  const reflector = {
    getAllAndOverride: vi.fn().mockReturnValue(metadata),
  } as unknown as Reflector;
  const handler = function placeholder() {};
  const ctx = {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => handler,
    getClass: () => class {},
  } as unknown as ExecutionContext;
  return { reflector, ctx };
}

function db(verified: boolean | null | { throw: Error }) {
  const queryRaw = vi.fn().mockImplementation(() => {
    if (verified && typeof verified === 'object' && 'throw' in verified) {
      return Promise.reject(verified.throw);
    }
    if (verified === null) return Promise.resolve([]);
    return Promise.resolve([{ email_verified: verified }]);
  });
  // The audit emitter calls `$executeRaw` on rejection paths. The tests
  // don't assert on the audit row itself — emission is best-effort and
  // the helper swallows errors — but the mock has to satisfy the
  // SessionDbClient interface, so we provide a no-op stub.
  const executeRaw = vi.fn().mockResolvedValue(0);
  return { $queryRaw: queryRaw, $executeRaw: executeRaw, _calls: queryRaw };
}

describe('RequireVerifiedEmailGuard', () => {
  it('no-ops when the handler has no @RequireVerifiedEmail() metadata', async () => {
    const { reflector, ctx } = ctxFor({ user: { id: 'u1' } }, undefined);
    const guard = new RequireVerifiedEmailGuard(reflector, db(false));
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('passes through when SessionCookieGuard has not run yet (no user.id)', async () => {
    const { reflector, ctx } = ctxFor({}, true);
    const guard = new RequireVerifiedEmailGuard(reflector, db(false));
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('allows verified users and caches the result on request.user', async () => {
    const req: FakeRequest = { user: { id: 'u1' } };
    const { reflector, ctx } = ctxFor(req, true);
    const fakeDb = db(true);
    const guard = new RequireVerifiedEmailGuard(reflector, fakeDb);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.user?.emailVerified).toBe(true);
    // Second call reuses the cached value — no second DB hit.
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(fakeDb._calls).toHaveBeenCalledTimes(1);
  });

  it("rejects unverified users with `email_not_verified`", async () => {
    const req: FakeRequest = { user: { id: 'u1' } };
    const { reflector, ctx } = ctxFor(req, true);
    const guard = new RequireVerifiedEmailGuard(reflector, db(false));
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({
      response: expect.objectContaining({
        statusCode: 403,
        message: 'email_not_verified',
      }),
    });
  });

  it("treats `user row not found` as unverified", async () => {
    const req: FakeRequest = { user: { id: 'deleted-user' } };
    const { reflector, ctx } = ctxFor(req, true);
    const guard = new RequireVerifiedEmailGuard(reflector, db(null));
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('reuses pre-set request.user.emailVerified without hitting the DB', async () => {
    const req: FakeRequest = { user: { id: 'u1', emailVerified: true } };
    const { reflector, ctx } = ctxFor(req, true);
    const fakeDb = db(false); // would fail if it ran
    const guard = new RequireVerifiedEmailGuard(reflector, fakeDb);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(fakeDb._calls).not.toHaveBeenCalled();
  });

  it("rejects when pre-set request.user.emailVerified is false", async () => {
    const req: FakeRequest = { user: { id: 'u1', emailVerified: false } };
    const { reflector, ctx } = ctxFor(req, true);
    const guard = new RequireVerifiedEmailGuard(reflector, db(true));
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({
      response: expect.objectContaining({ message: 'email_not_verified' }),
    });
  });

  it("surfaces a distinct shape on DB lookup failure", async () => {
    const req: FakeRequest = { user: { id: 'u1' } };
    const { reflector, ctx } = ctxFor(req, true);
    const guard = new RequireVerifiedEmailGuard(
      reflector,
      db({ throw: new Error('connection refused') }),
    );
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({
      response: expect.objectContaining({
        message: 'email_not_verified',
        reason: 'verification_check_failed',
      }),
    });
  });
});
