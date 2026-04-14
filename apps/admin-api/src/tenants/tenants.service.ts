import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTenantDto) {
    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: dto.name,
          slug: dto.slug,
          displayName: dto.displayName,
          domain: dto.domain,
          logoUrl: dto.logoUrl,
          faviconUrl: dto.faviconUrl,
          plan: dto.plan,
          dataResidency: dto.dataResidency,
          settings: dto.settings ?? undefined,
          metadata: dto.metadata ?? undefined,
          maxUsers: dto.maxUsers,
          maxApps: dto.maxApps,
          isActive: dto.isActive ?? true,
        },
      });

      await tx.tenantPolicy.create({
        data: { tenantId: tenant.id },
      });

      this.logger.log(`Tenant created: ${tenant.id} (${tenant.slug})`);
      return tenant;
    });
  }

  async findAll(page = 1, pageSize = 20) {
    const skip = (page - 1) * pageSize;
    const where = { deletedAt: null };

    const [data, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.tenant.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  async findOne(id: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });

    if (!tenant || tenant.deletedAt) {
      throw new NotFoundException(`Tenant with id "${id}" not found`);
    }

    return tenant;
  }

  async update(id: string, dto: UpdateTenantDto) {
    const existing = await this.findOne(id);

    if (existing.version !== dto.version) {
      throw new ConflictException(
        `Version conflict: expected ${dto.version}, found ${existing.version}. The tenant has been modified by another request.`,
      );
    }

    const { version: _version, ...updateData } = dto;

    const tenant = await this.prisma.tenant.update({
      where: { id },
      data: {
        ...updateData,
        settings: updateData.settings ?? undefined,
        metadata: updateData.metadata ?? undefined,
        version: { increment: 1 },
      },
    });

    this.logger.log(`Tenant updated: ${tenant.id} (v${tenant.version})`);
    return tenant;
  }

  async remove(id: string) {
    await this.findOne(id);

    const tenant = await this.prisma.tenant.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    this.logger.log(`Tenant soft-deleted: ${tenant.id}`);
    return tenant;
  }
}
