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
   * Read-only smoke test for an IdP. SAML: probe the SSO URL. OIDC: fetch
   * the discovery document and confirm `issuer` matches what we have stored.
   *
   * Server-side timeout: 5s. Returns `{ ok, details? }` with a parsed error
   * string suitable for surfacing to the operator. Never mutates state.
   *
   * SSRF hardening — operator-supplied URLs are dangerous because they're
   * fetched server-side. Three defenses, in order:
   *
   *   1. Scheme allowlist: `https:` only. Blocks `file:`, `gopher:`,
   *      `data:`, etc. We don't allow `http:` because no production IdP
   *      should be served unencrypted, and dropping it shrinks the attack
   *      surface (no automatic HTTPS upgrade in fetch).
   *   2. Hostname → IP resolution + private-range block. AWS IMDS
   *      (169.254.169.254), loopback (127.0.0.0/8, ::1), RFC1918, and
   *      link-local are denied before the fetch.
   *   3. `redirect: 'error'` so a public URL can't 30x-bounce the probe
   *      into an internal address. (Same posture as session.service.ts.)
   *
   * Verified IP after resolution rather than relying on hostname inspection
   * — `1.1.1.1.nip.io` looks public but resolves to 1.1.1.1. We re-resolve
   * here even though `fetch()` will too; there's a TOCTOU window we accept
   * because the upside (compromise = read-only response body) is bounded.
   */
  async test(tenantId: string, id: string): Promise<{ ok: boolean; details?: string }> {
    const idp = await this.prisma.identityProvider.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!idp) {
      throw new NotFoundException(`Identity provider "${id}" not found`);
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5_000);
    try {
      if (idp.type === 'saml') {
        // We didn't store a metadata URL separately; the SSO URL is the
        // closest thing we have. Operators should pass the metadata URL
        // when they create the IdP — once that's wired we'll prefer it.
        if (!idp.samlSsoUrl) {
          return { ok: false, details: 'No SAML SSO URL configured' };
        }
        const guard = await this.assertSafeProbeUrl(idp.samlSsoUrl);
        if (!guard.ok) return guard;
        const res = await fetch(idp.samlSsoUrl, {
          signal: ctrl.signal,
          redirect: 'error',
        });
        if (!res.ok) {
          return { ok: false, details: `SAML SSO URL returned HTTP ${res.status}` };
        }
        return { ok: true };
      }
      if (idp.type === 'oidc') {
        const discoveryUrl =
          idp.oidcDiscoveryUrl ??
          (idp.oidcIssuer
            ? `${idp.oidcIssuer}/.well-known/openid-configuration`
            : null);
        if (!discoveryUrl) {
          return { ok: false, details: 'No OIDC issuer configured' };
        }
        const guard = await this.assertSafeProbeUrl(discoveryUrl);
        if (!guard.ok) return guard;
        const res = await fetch(discoveryUrl, {
          signal: ctrl.signal,
          redirect: 'error',
        });
        if (!res.ok) {
          return {
            ok: false,
            details: `Discovery doc returned HTTP ${res.status}`,
          };
        }
        const doc = (await res.json()) as { issuer?: string };
        if (idp.oidcIssuer && doc.issuer && doc.issuer !== idp.oidcIssuer) {
          return {
            ok: false,
            details: `Discovery issuer "${doc.issuer}" does not match configured issuer "${idp.oidcIssuer}"`,
          };
        }
        return { ok: true };
      }
      return { ok: false, details: `Unknown IdP type: ${idp.type}` };
    } catch (err) {
      const message =
        err instanceof Error
          ? err.name === 'AbortError'
            ? 'Probe timed out after 5s'
            : err.message
          : 'Unknown error';
      this.logger.warn(`IdP test failed for ${id}: ${message}`);
      return { ok: false, details: message };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Validate an operator-supplied URL is safe to fetch from inside the
   * cluster. Returns `{ ok: true }` to mean "go ahead", or
   * `{ ok: false, details }` ready to bubble to the caller.
   *
   * Returns false (with a stable, non-leaky message) for: non-https schemes,
   * unparseable URLs, hostnames whose A/AAAA records resolve to private,
   * loopback, link-local, or unique-local addresses.
   *
   * Failures are intentionally vague to operators — "URL is not reachable"
   * vs. "URL points at 169.254.169.254" — to avoid turning the probe into a
   * blind-SSRF oracle for internal-network discovery.
   */
  private async assertSafeProbeUrl(
    raw: string,
  ): Promise<{ ok: true } | { ok: false; details: string }> {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return { ok: false, details: 'Probe URL is not a valid URL' };
    }
    if (url.protocol !== 'https:') {
      return {
        ok: false,
        details: 'Probe URL must use https:// (operator IdPs should never serve plaintext)',
      };
    }
    // Strip IPv6 brackets so dns.lookup() and net.isIP() handle the literal.
    const host = url.hostname.replace(/^\[|\]$/g, '');
    let addresses: { address: string }[];
    try {
      const dns = await import('node:dns/promises');
      addresses = await dns.lookup(host, { all: true });
    } catch {
      return { ok: false, details: 'Probe URL hostname did not resolve' };
    }
    for (const { address } of addresses) {
      if (isPrivateAddress(address)) {
        // Don't echo the resolved IP — that converts a probe into a DNS
        // reconnaissance tool. Generic message suffices.
        return { ok: false, details: 'Probe URL resolves to a non-routable address' };
      }
    }
    return { ok: true };
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

/**
 * Return true iff `address` is in a range we never want admin-api fetching.
 * Covers the IPv4 ranges Cloud-provider metadata services and internal
 * networks live in, plus their IPv6 equivalents.
 *
 * The list is intentionally conservative — false-positives just block a
 * legitimate IdP, false-negatives let SSRF through.
 */
function isPrivateAddress(address: string): boolean {
  // IPv4 — quick numeric check on the dotted quad.
  const v4 = address.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [, a, b] = v4.map(Number) as [number, number, number, number, number];
    if (a === 10) return true; // 10.0.0.0/8 (RFC1918)
    if (a === 127) return true; // 127.0.0.0/8 (loopback)
    if (a === 0) return true; // 0.0.0.0/8 (this network)
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local + AWS IMDS)
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 (RFC1918)
    if (a === 192 && b === 168) return true; // 192.168.0.0/16 (RFC1918)
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)
    if (a >= 224) return true; // 224.0.0.0/4 (multicast) + 240.0.0.0/4 (reserved)
    return false;
  }
  // IPv6 — match common private prefixes case-insensitively.
  const v6 = address.toLowerCase();
  if (v6 === '::1' || v6 === '::') return true; // loopback + unspecified
  if (v6.startsWith('fe80:')) return true; // link-local
  if (v6.startsWith('fc') || v6.startsWith('fd')) return true; // unique local (fc00::/7)
  if (v6.startsWith('::ffff:')) {
    // IPv4-mapped IPv6 — recurse on the embedded v4.
    return isPrivateAddress(v6.replace('::ffff:', ''));
  }
  return false;
}
