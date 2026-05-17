import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateUserDto) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _password, ...userData } = dto;

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        displayName: userData.displayName,
        firstName: userData.firstName,
        lastName: userData.lastName,
        phoneNumber: userData.phoneNumber,
        locale: userData.locale ?? 'en',
        timezone: userData.timezone ?? 'UTC',
        status: userData.status ?? 'pending_verification',
        emailVerified: userData.emailVerified ?? false,
        // passwordHash is set by the identity-service, not the admin-api
      },
    });

    // Create membership linking user to tenant
    await this.prisma.membership.create({
      data: {
        userId: user.id,
        tenantId,
        role: 'member',
        joinedAt: new Date(),
      },
    });

    this.logger.log(
      `User created: ${user.id} (${user.email}) in tenant ${tenantId}`
    );
    return this.sanitize(user);
  }

  async findAll(
    tenantId: string,
    page = 1,
    pageSize = 20,
    search?: string,
  ) {
    const skip = (page - 1) * pageSize;
    // Plan caps server-side search at 200 chars — anything longer is almost
    // certainly an attack or copy-paste accident, not a real query.
    const trimmed = search?.trim().slice(0, 200) || undefined;
    const where = {
      deletedAt: null,
      memberships: { some: { tenantId, deletedAt: null } },
      ...(trimmed
        ? {
            OR: [
              { email: { contains: trimmed, mode: 'insensitive' as const } },
              { displayName: { contains: trimmed, mode: 'insensitive' as const } },
              { firstName: { contains: trimmed, mode: 'insensitive' as const } },
              { lastName: { contains: trimmed, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { data: data.map(this.sanitize), total, page, pageSize };
  }

  async findOne(tenantId: string, id: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id,
        deletedAt: null,
        memberships: { some: { tenantId, deletedAt: null } },
      },
    });

    if (!user) {
      throw new NotFoundException(`User "${id}" not found in this tenant`);
    }

    return this.sanitize(user);
  }

  async update(tenantId: string, id: string, dto: UpdateUserDto) {
    const existing = await this.findOne(tenantId, id);

    if (existing.version !== dto.version) {
      throw new ConflictException(
        `Version conflict: expected ${dto.version}, found ${existing.version}`
      );
    }

    const { version: _version, ...updateData } = dto;

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...updateData,
        version: { increment: 1 },
      },
    });

    this.logger.log(`User updated: ${user.id} (v${user.version})`);
    return this.sanitize(user);
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);

    const user = await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    this.logger.log(`User soft-deleted: ${user.id}`);
    return this.sanitize(user);
  }

  // Strip sensitive fields from response
  private sanitize(user: Record<string, unknown>) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash: _ph, metadata: _m, ...safe } = user;
    return safe;
  }
}
