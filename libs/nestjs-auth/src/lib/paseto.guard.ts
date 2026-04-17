import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';

// paseto-ts is ESM-only; load it dynamically so CJS-bundled apps that don't
// invoke this guard (e.g., browser auth via SessionCookieGuard) don't crash
// on import. Only M2M API-client flows that actually use Bearer PASETO tokens
// will pay the first-call cost.
type DecryptFn = (key: string, token: string) => { payload: unknown };
let decryptFn: DecryptFn | null = null;
async function getDecrypt(): Promise<DecryptFn> {
  if (!decryptFn) {
    const mod = await import('paseto-ts/v4');
    decryptFn = mod.decrypt as unknown as DecryptFn;
  }
  return decryptFn;
}

export interface AuthUser {
  id: string;
  tenantId: string;
  jti: string;
}

@Injectable()
export class PasetoGuard implements CanActivate {
  private readonly logger = new Logger(PasetoGuard.name);
  private symmetricKey: string | null = null;

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const request = ctx.switchToHttp().getRequest();
    const authHeader =
      request.headers?.['authorization'] ?? request.headers?.['Authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Missing or invalid Authorization header'
      );
    }

    const token = authHeader.slice(7);

    try {
      const key = this.getSymmetricKey();
      const decrypt = await getDecrypt();
      const { payload } = decrypt(key, token);

      const claims = payload as Record<string, unknown>;

      // Validate expiry if present
      if (claims['exp']) {
        const expDate = new Date(claims['exp'] as string);
        if (expDate.getTime() < Date.now()) {
          throw new UnauthorizedException('Token has expired');
        }
      }

      const user: AuthUser = {
        id: claims['sub'] as string,
        tenantId: claims['tid'] as string,
        jti: claims['jti'] as string,
      };

      if (!user.id || !user.tenantId) {
        throw new UnauthorizedException(
          'Token missing required claims (sub, tid)'
        );
      }

      request['user'] = user;
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.warn(
        `PASETO token validation failed: ${(error as Error).message}`
      );
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  /**
   * Returns the symmetric key in `k4.local.<base64url>` format.
   *
   * Reads from PASETO_SYMMETRIC_KEY env (expects `k4.local.` prefixed key)
   * or PASETO_SYMMETRIC_KEY_HEX env (expects 32-byte hex string, which is
   * converted to the `k4.local.` format).
   */
  private getSymmetricKey(): string {
    if (this.symmetricKey) {
      return this.symmetricKey;
    }

    // First try the prefixed key directly
    const prefixedKey = process.env['PASETO_SYMMETRIC_KEY'];
    if (prefixedKey) {
      this.symmetricKey = prefixedKey;
      return this.symmetricKey;
    }

    // Fall back to hex-encoded key
    const keyHex = process.env['PASETO_SYMMETRIC_KEY_HEX'];
    if (!keyHex) {
      throw new UnauthorizedException(
        'Neither PASETO_SYMMETRIC_KEY nor PASETO_SYMMETRIC_KEY_HEX environment variable is set'
      );
    }

    // Convert hex to base64url and prepend the k4.local. prefix
    const keyBytes = Buffer.from(keyHex, 'hex');
    if (keyBytes.length !== 32) {
      throw new UnauthorizedException(
        `PASETO symmetric key must be 32 bytes, got ${keyBytes.length}`
      );
    }

    const base64url = keyBytes
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    this.symmetricKey = `k4.local.${base64url}`;
    return this.symmetricKey;
  }
}
