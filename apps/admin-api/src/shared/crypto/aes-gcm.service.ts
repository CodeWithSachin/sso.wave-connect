import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'crypto';

/**
 * AES-256-GCM envelope encryption for column-level secrets (OIDC client
 * secrets, IdP credentials, anything stored at rest that must round-trip).
 *
 * Wire format: `v1:<base64url(iv)>:<base64url(ciphertext || authTag)>`.
 *
 * The `v1` prefix lets us rotate the key/algorithm without rewriting every
 * stored row at once — readers branch on the prefix and choose the right
 * key, writers always emit the current version.
 *
 * Key sourcing: 32 raw bytes, base64-encoded, in `OIDC_SECRET_KEY`. We
 * deliberately throw on boot if it's missing or the wrong length so a
 * misconfigured deployment fails fast instead of silently writing plaintext
 * or producing rows we can't ever decrypt.
 */
@Injectable()
export class AesGcmService implements OnModuleInit {
  private readonly logger = new Logger(AesGcmService.name);
  private static readonly ALGO = 'aes-256-gcm';
  private static readonly KEY_BYTES = 32;
  private static readonly IV_BYTES = 12;
  private static readonly TAG_BYTES = 16;
  private static readonly VERSION = 'v1';

  private key!: Buffer;

  onModuleInit(): void {
    const raw = process.env.OIDC_SECRET_KEY;
    if (!raw) {
      throw new Error(
        'OIDC_SECRET_KEY env var is required for AesGcmService (expected 32 raw bytes, base64-encoded)',
      );
    }
    let decoded: Buffer;
    try {
      decoded = Buffer.from(raw, 'base64');
    } catch {
      throw new Error('OIDC_SECRET_KEY must be valid base64');
    }
    if (decoded.length !== AesGcmService.KEY_BYTES) {
      throw new Error(
        `OIDC_SECRET_KEY must decode to ${AesGcmService.KEY_BYTES} bytes (got ${decoded.length})`,
      );
    }
    this.key = decoded;
    this.logger.log('AES-256-GCM key loaded (v1)');
  }

  /**
   * Encrypt a UTF-8 string. Returns the wire-format token; the caller stores
   * the returned string in the `*_enc` column verbatim.
   *
   * Empty input is a caller bug (the corresponding DTOs are @IsNotEmpty) —
   * surfacing as BadRequest keeps the error visible to the API consumer
   * without falsely implying our service is broken.
   */
  encrypt(plaintext: string): string {
    if (plaintext === '') {
      throw new BadRequestException(
        'Cannot encrypt an empty value — secret must be non-empty',
      );
    }
    const iv = randomBytes(AesGcmService.IV_BYTES);
    const cipher = createCipheriv(AesGcmService.ALGO, this.key, iv);
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [
      AesGcmService.VERSION,
      iv.toString('base64url'),
      Buffer.concat([ct, tag]).toString('base64url'),
    ].join(':');
  }

  /**
   * Decrypt a token previously produced by `encrypt`. Throws if the format,
   * version, or authentication tag is invalid — a failed decrypt is *never*
   * silently coerced to empty string.
   *
   * Externally-surfaced messages are intentionally opaque ("decrypt failed").
   * The structured log line carries the specific reason for operators; we
   * don't return it to the API caller because a leaky error makes
   * tampering-against-stored-ciphertext a useful oracle ("ciphertext shorter
   * than auth tag" tells an attacker how their tamper landed). Treat decrypt
   * as constant-error from outside.
   */
  decrypt(token: string): string {
    const fail = (reason: string): InternalServerErrorException => {
      this.logger.warn(`AES-GCM decrypt failed: ${reason}`);
      return new InternalServerErrorException('Failed to decrypt stored secret');
    };

    const parts = token.split(':');
    if (parts.length !== 3) {
      throw fail('invalid token format (segment count)');
    }
    const [version, ivB64, payloadB64] = parts;
    if (version !== AesGcmService.VERSION) {
      throw fail(`unsupported version: ${version}`);
    }
    const iv = Buffer.from(ivB64, 'base64url');
    const payload = Buffer.from(payloadB64, 'base64url');
    if (iv.length !== AesGcmService.IV_BYTES) {
      throw fail(`invalid IV length: ${iv.length}`);
    }
    if (payload.length < AesGcmService.TAG_BYTES) {
      throw fail('payload shorter than auth tag');
    }
    const tag = payload.subarray(payload.length - AesGcmService.TAG_BYTES);
    const ct = payload.subarray(0, payload.length - AesGcmService.TAG_BYTES);
    const decipher = createDecipheriv(AesGcmService.ALGO, this.key, iv);
    decipher.setAuthTag(tag);
    try {
      return Buffer.concat([decipher.update(ct), decipher.final()]).toString(
        'utf8',
      );
    } catch (err) {
      throw fail((err as Error).message);
    }
  }

  /**
   * Cheap test for "looks like one of our encrypted tokens" so callers
   * (mainly migrations and the IdP service handling legacy rows) can
   * distinguish v1 ciphertext from plaintext secrets written before
   * this service existed.
   */
  isEncrypted(value: string | null | undefined): boolean {
    return !!value && value.startsWith(`${AesGcmService.VERSION}:`);
  }
}
