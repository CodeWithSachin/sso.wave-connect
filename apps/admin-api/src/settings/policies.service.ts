import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { UpdatePolicyDto } from './dto/update-policy.dto';

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
   * Update security policy with optimistic locking.
   */
  async update(tenantId: string, dto: UpdatePolicyDto) {
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

    this.logger.log(`Policy updated for tenant ${tenantId} (v${policy.version})`);
    return policy;
  }
}
