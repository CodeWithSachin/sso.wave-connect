import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EmailService } from '@sso-platform/nestjs-email';
import { PrismaService } from '../shared/prisma/prisma.service';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { randomBytes, createHash, randomUUID } from 'crypto';

/**
 * Invitation token lifetime. Matches the plan spec (Phase 6): 14 days of
 * runway after an admin clicks "invite" so the recipient has time to act on
 * the email without the link rotting in their inbox.
 */
const INVITATION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * URL the user clicks to reach the accept/decline UI. Sourced from
 * INVITATION_LINK_BASE_URL so dev + prod can differ. Falls back to the
 * login-portal origin used elsewhere in this codebase.
 */
const INVITATION_LINK_BASE_URL =
  process.env.INVITATION_LINK_BASE_URL ?? 'http://localhost:4300';

@Injectable()
export class MembershipsService {
  private readonly logger = new Logger(MembershipsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  /**
   * Invite a user to join a tenant.
   *
   * Phase 6 flow (changed from "instant membership" to "pending invitation"):
   *
   *   1. Find or create the user row. A brand-new user gets a placeholder
   *      with no password, `status='pending_verification'`, `email_verified=false`
   *      — the accept endpoint (in identity-service) will fill these in.
   *   2. Upsert a PENDING membership: `joined_at IS NULL`,
   *      `invitation_token = sha256(raw)`, `invitation_expires = NOW() + 14d`.
   *   3. Send an invitation email with the raw token baked into the link.
   *
   * Authz tuples are deliberately NOT written here — a pending member
   * shouldn't have effective permissions. The accept endpoint writes the
   * tuple in the same transaction as `joined_at`.
   *
   * Re-inviting a pending member is idempotent: we rotate the token + extend
   * the expiry + resend the email. Inviting a user who's already fully
   * joined returns 409.
   */
  async invite(tenantId: string, dto: InviteMemberDto, inviterId?: string) {
    const role = dto.role ?? 'member';

    // 1. Resolve or create the invited user.
    let user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: dto.email,
          emailVerified: false,
          status: 'pending_verification',
          // passwordHash is intentionally left unset — the accept flow
          // will require the invitee to pick a password. Schema allows null.
        },
      });
      this.logger.log(`Created pending user for invite: email=${dto.email} id=${user.id}`);
    }

    // 2. Membership state machine: brand-new, pending-resend, or full-conflict.
    const existing = await this.prisma.membership.findUnique({
      where: { tenantId_userId: { tenantId, userId: user.id } },
    });
    if (existing && existing.joinedAt && !existing.deletedAt) {
      throw new ConflictException('User is already a member of this tenant');
    }

    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
    });

    // 3. Mint a fresh token; store the SHA-256 hash, email the raw.
    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = sha256Hex(rawToken);
    const expires = new Date(Date.now() + INVITATION_TTL_MS);

    const membership = existing
      ? await this.prisma.membership.update({
          where: { id: existing.id },
          data: {
            role,
            invitedBy: inviterId,
            invitationToken: tokenHash,
            invitationExpires: expires,
            joinedAt: null,
            deletedAt: null,
          },
        })
      : await this.prisma.membership.create({
          data: {
            userId: user.id,
            tenantId,
            role,
            invitedBy: inviterId,
            invitationToken: tokenHash,
            invitationExpires: expires,
            // joinedAt deliberately null → pending until accepted.
          },
        });

    this.logger.log(
      `Invitation issued: membership=${membership.id} user=${user.id} tenant=${tenantId} role=${role} expires=${expires.toISOString()}`,
    );

    // 4. Send the email. Failure is non-fatal: the membership row is the
    //    source of truth, the admin can resend via POST /memberships again
    //    which rotates the token + resends.
    await this.sendInvitationEmail({
      to: dto.email,
      rawToken,
      tenantName: tenant.displayName ?? tenant.name,
      role,
      expiresAt: expires,
    });

    return membership;
  }

  /**
   * Render + send the invitation email. Kept private and synchronous with
   * the invite transaction because we want send failures (SES outage etc.)
   * to log but not poison the membership row. Templating stays inline here
   * for parity with the Go-side inline text templates in
   * identity-service/internal/service/signup_org.go — once there's a real
   * hbs pipeline in libs/nestjs-email, move this render there.
   */
  private async sendInvitationEmail(args: {
    to: string;
    rawToken: string;
    tenantName: string;
    role: string;
    expiresAt: Date;
  }): Promise<void> {
    const link = `${INVITATION_LINK_BASE_URL.replace(/\/$/, '')}/invitation/${encodeURIComponent(args.rawToken)}`;
    const expiresFormatted = args.expiresAt.toUTCString();
    const subject = `You're invited to join ${args.tenantName} on WaveConnect`;
    const text =
      `You've been invited to join ${args.tenantName} on WaveConnect as ${args.role}.\n\n` +
      `Accept the invitation:\n  ${link}\n\n` +
      `This link expires on ${expiresFormatted}. If you didn't expect this, ignore it — no action is taken on your account unless you accept.\n\n` +
      `— WaveConnect`;

    try {
      await this.email.send({
        to: args.to,
        subject,
        text,
        // IdempotencyKey ensures a dedupe hash — retries of the same raw
        // token don't double-send. Uses first 12 chars of the token for
        // brevity; sufficient for provider-level dedup.
        idempotencyKey: `invite:${args.rawToken.slice(0, 12)}`,
        tags: { category: 'tenant_invitation' },
      });
    } catch (err) {
      // Non-fatal — membership row is valid and admin can resend.
      this.logger.warn(
        `Invitation email send failed (row still valid): to=${args.to} err=${(err as Error).message}`,
      );
    }
  }

  /**
   * List tenant memberships, optionally filtered by status. Status is derived
   * (no DB column) so the filter translates to a `where` shape on each branch:
   *
   *   accepted  → joinedAt IS NOT NULL
   *   pending   → joinedAt IS NULL AND invitationExpires > NOW()
   *   expired   → joinedAt IS NULL AND invitationExpires <= NOW()
   *
   * Soft-deleted rows are always excluded — revocation is a delete, not a
   * status. Phase 6 added the filter to back the Invitations page tabs.
   */
  async findAll(
    tenantId: string,
    page = 1,
    pageSize = 20,
    status?: 'pending' | 'accepted' | 'expired',
  ) {
    const skip = (page - 1) * pageSize;
    const now = new Date();
    const baseWhere = { tenantId, deletedAt: null } as const;
    const where =
      status === 'accepted'
        ? { ...baseWhere, joinedAt: { not: null } }
        : status === 'pending'
          ? { ...baseWhere, joinedAt: null, invitationExpires: { gt: now } }
          : status === 'expired'
            ? { ...baseWhere, joinedAt: null, invitationExpires: { lte: now } }
            : baseWhere;

    const [data, total] = await Promise.all([
      this.prisma.membership.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { id: true, email: true, displayName: true, avatarUrl: true },
          },
        },
      }),
      this.prisma.membership.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  /**
   * Resend the invitation email for a pending membership. Loads the row,
   * confirms it's still pending, then delegates to `invite()` which rotates
   * the token, extends the expiry, and resends.
   *
   * Throws `ConflictException` (HTTP 409) when the membership has already
   * been accepted — by definition there is nothing to resend, and silently
   * succeeding would mislead the operator. The call is therefore safe to
   * retry on a pending row (token rotation always favours the latest send)
   * but is **not** idempotent across the pending → accepted boundary.
   *
   * Per plan v2 D7 (Resend auth): the caller must currently hold
   * `manage_invitations`. Backend enforcement is the SessionCookieGuard at
   * the controller; this method only needs the email to be addressable.
   */
  async resend(tenantId: string, membershipId: string, actorId?: string) {
    const existing = await this.findOne(tenantId, membershipId);
    if (existing.joinedAt) {
      throw new ConflictException(
        'Membership is already accepted; nothing to resend',
      );
    }
    return this.invite(
      tenantId,
      { email: existing.user.email, role: existing.role },
      actorId ?? existing.invitedBy ?? undefined,
    );
  }

  async findOne(tenantId: string, id: string) {
    const membership = await this.prisma.membership.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        user: {
          select: { id: true, email: true, displayName: true, avatarUrl: true },
        },
      },
    });

    if (!membership) {
      throw new NotFoundException(`Membership "${id}" not found`);
    }

    return membership;
  }

  /**
   * Update a member's role.
   * Deletes the old tuple and writes the new one to authz_outbox.
   */
  async updateRole(tenantId: string, id: string, dto: UpdateRoleDto, actorId?: string) {
    const existing = await this.findOne(tenantId, id);

    if (existing.role === dto.role) {
      return existing; // No change needed
    }

    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
    });

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.membership.update({
        where: { id },
        data: { role: dto.role },
        include: {
          user: {
            select: { id: true, email: true, displayName: true, avatarUrl: true },
          },
        },
      });

      const storeId = tenant.openfgaStoreId ?? '';
      const batchId = randomUUID();

      // Delete old role tuple
      await tx.authzOutbox.create({
        data: {
          tenantId,
          storeId,
          operation: 'delete',
          tupleUser: `user:${existing.userId}`,
          tupleRelation: existing.role,
          tupleObject: `organization:${tenantId}`,
          idempotencyKey: `membership:${id}:del:${existing.role}:${batchId}`,
          actorUserId: actorId,
          source: 'admin-api',
        },
      });

      // Write new role tuple
      await tx.authzOutbox.create({
        data: {
          tenantId,
          storeId,
          operation: 'write',
          tupleUser: `user:${existing.userId}`,
          tupleRelation: dto.role,
          tupleObject: `organization:${tenantId}`,
          idempotencyKey: `membership:${id}:add:${dto.role}:${batchId}`,
          actorUserId: actorId,
          source: 'admin-api',
        },
      });

      this.logger.log(
        `Membership role updated: ${id} ${existing.role} -> ${dto.role}`
      );
      return updated;
    });
  }

  /**
   * Remove a membership.
   * Soft-deletes + writes delete tuple to authz_outbox.
   */
  async remove(tenantId: string, id: string, actorId?: string) {
    const existing = await this.findOne(tenantId, id);

    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
    });

    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.membership.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      await tx.authzOutbox.create({
        data: {
          tenantId,
          storeId: tenant.openfgaStoreId ?? '',
          operation: 'delete',
          tupleUser: `user:${existing.userId}`,
          tupleRelation: existing.role,
          tupleObject: `organization:${tenantId}`,
          idempotencyKey: `membership:${id}:remove:${randomUUID()}`,
          actorUserId: actorId,
          source: 'admin-api',
        },
      });

      this.logger.log(`Membership removed: ${id}`);
      return deleted;
    });
  }
}

/**
 * SHA-256 hex of the given string — matches the digest format identity-service
 * uses for email_verification_tokens and sso_session cookies, so the same
 * primitive works across both sides of the invitation round-trip.
 */
function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
