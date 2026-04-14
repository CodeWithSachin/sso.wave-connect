import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { CreateSamlIdpDto, CreateOidcIdpDto } from './dto/create-idp.dto';
import { UpdateIdpDto } from './dto/update-idp.dto';

@Injectable()
export class IdpService {
  private readonly logger = new Logger(IdpService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createSaml(tenantId: string, dto: CreateSamlIdpDto) {
    const idp = await this.prisma.identityProvider.create({
      data: {
        tenantId,
        name: dto.name,
        type: 'saml',
        domainHint: dto.domainHint,
        samlEntityId: dto.samlEntityId,
        samlSsoUrl: dto.samlSsoUrl,
        samlSloUrl: dto.samlSloUrl,
        samlCertificate: dto.samlCertificate,
        samlSigningAlgorithm: dto.samlSigningAlgorithm ?? 'RSA-SHA256',
        samlNameIdFormat: dto.samlNameIdFormat,
        attributeMapping: dto.attributeMapping ?? {
          email: 'email',
          firstName: 'first_name',
          lastName: 'last_name',
          displayName: 'display_name',
          groups: 'groups',
        },
        jitProvisioning: dto.jitProvisioning ?? true,
        defaultRole: dto.defaultRole ?? 'member',
      },
    });

    this.logger.log(`SAML IdP created: ${idp.id} (${idp.name}) for tenant ${tenantId}`);
    return this.sanitize(idp);
  }

  async createOidc(tenantId: string, dto: CreateOidcIdpDto) {
    // In production, encrypt the client secret before storing
    const idp = await this.prisma.identityProvider.create({
      data: {
        tenantId,
        name: dto.name,
        type: 'oidc',
        domainHint: dto.domainHint,
        oidcIssuer: dto.oidcIssuer,
        oidcClientId: dto.oidcClientId,
        oidcClientSecretEnc: dto.oidcClientSecret, // TODO: encrypt at rest
        oidcDiscoveryUrl:
          dto.oidcDiscoveryUrl ??
          `${dto.oidcIssuer}/.well-known/openid-configuration`,
        oidcScopes: dto.oidcScopes ?? ['openid', 'profile', 'email'],
        attributeMapping: dto.attributeMapping ?? {
          email: 'email',
          firstName: 'first_name',
          lastName: 'last_name',
          displayName: 'display_name',
          groups: 'groups',
        },
        jitProvisioning: dto.jitProvisioning ?? true,
        defaultRole: dto.defaultRole ?? 'member',
      },
    });

    this.logger.log(`OIDC IdP created: ${idp.id} (${idp.name}) for tenant ${tenantId}`);
    return this.sanitize(idp);
  }

  async findAll(tenantId: string, page = 1, pageSize = 20) {
    const skip = (page - 1) * pageSize;
    const where = { tenantId, deletedAt: null };

    const [data, total] = await Promise.all([
      this.prisma.identityProvider.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.identityProvider.count({ where }),
    ]);

    return { data: data.map(this.sanitize), total, page, pageSize };
  }

  async findOne(tenantId: string, id: string) {
    const idp = await this.prisma.identityProvider.findFirst({
      where: { id, tenantId, deletedAt: null },
    });

    if (!idp) {
      throw new NotFoundException(`Identity provider "${id}" not found`);
    }

    return this.sanitize(idp);
  }

  async update(tenantId: string, id: string, dto: UpdateIdpDto) {
    const existing = await this.prisma.identityProvider.findFirst({
      where: { id, tenantId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException(`Identity provider "${id}" not found`);
    }

    if (existing.version !== dto.version) {
      throw new ConflictException(
        `Version conflict: expected ${dto.version}, found ${existing.version}`
      );
    }

    const { version: _v, oidcClientSecret, ...updateData } = dto;

    const idp = await this.prisma.identityProvider.update({
      where: { id },
      data: {
        ...updateData,
        // If client secret is being updated, store it (TODO: encrypt)
        ...(oidcClientSecret ? { oidcClientSecretEnc: oidcClientSecret } : {}),
        attributeMapping: updateData.attributeMapping ?? undefined,
        version: { increment: 1 },
      },
    });

    this.logger.log(`IdP updated: ${idp.id} (v${idp.version})`);
    return this.sanitize(idp);
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);

    const idp = await this.prisma.identityProvider.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    this.logger.log(`IdP soft-deleted: ${idp.id}`);
    return this.sanitize(idp);
  }

  /**
   * Strip sensitive fields (SAML certificates, OIDC client secrets) from responses.
   */
  private sanitize(idp: Record<string, unknown>) {
    const {
      samlCertificate: _cert,
      oidcClientSecretEnc: _secret,
      ...safe
    } = idp;
    return safe;
  }
}
