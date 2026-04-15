import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { createHash } from 'crypto';
import { PrismaService } from '../../shared/prisma/prisma.service';

@Injectable()
export class ScimAuthGuard implements CanActivate {
  private readonly logger = new Logger(ScimAuthGuard.name);

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid SCIM bearer token');
    }

    const token = authHeader.slice(7);
    const tokenHash = createHash('sha256').update(token).digest('hex');

    // Look up active, non-expired SCIM token
    const scimToken = await this.prisma.$queryRaw<
      { id: string; tenant_id: string }[]
    >`
      SELECT id, tenant_id FROM scim_tokens
      WHERE token_hash = ${tokenHash}
        AND is_active = true
        AND (expires_at IS NULL OR expires_at > NOW())
      LIMIT 1
    `;

    if (!scimToken || scimToken.length === 0) {
      throw new UnauthorizedException('Invalid or expired SCIM token');
    }

    // Update last_used_at
    await this.prisma.$executeRaw`
      UPDATE scim_tokens SET last_used_at = NOW() WHERE id = ${scimToken[0].id}::uuid
    `;

    // Attach tenant context to request
    (request as any).tenantId = scimToken[0].tenant_id;
    (request as any).scimTokenId = scimToken[0].id;

    this.logger.debug(
      `SCIM request authenticated for tenant ${scimToken[0].tenant_id}`,
    );

    return true;
  }
}
