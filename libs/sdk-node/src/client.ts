import type {
  SSOConfig,
  TokenClaims,
  IntrospectionResult,
  CheckRequest,
  CheckResponse,
  ListObjectsRequest,
  ListObjectsResponse,
} from './types';

/**
 * WaveConnect SSO SDK Client.
 *
 * Provides PASETO token verification, introspection, Express middleware,
 * and ReBAC permission checks.
 *
 * @example
 * ```typescript
 * const client = new SSOClient({
 *   domain: 'sso.wave-connect.com',
 *   clientId: 'app_abc123',
 * });
 *
 * // Verify an ID token (v4.public)
 * const claims = await client.verifyPublicToken(token);
 *
 * // Express middleware
 * app.use(client.authenticate());
 *
 * // Check permissions
 * const { allowed } = await client.check({
 *   user: 'user:123', relation: 'can_edit', object: 'doc:456'
 * });
 * ```
 */
export class SSOClient {
  private readonly baseUrl: string;
  private readonly clientId: string;
  private readonly clientSecret?: string;

  constructor(config: SSOConfig) {
    this.baseUrl = config.domain.startsWith('http')
      ? config.domain
      : `https://${config.domain}`;
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
  }

  /**
   * Introspect a token via the SSO service.
   * Works for all token types — the server decrypts/verifies.
   */
  async introspect(token: string): Promise<IntrospectionResult> {
    const res = await fetch(`${this.baseUrl}/oauth2/introspect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(this.clientSecret
          ? {
              Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`,
            }
          : {}),
      },
      body: `token=${encodeURIComponent(token)}`,
    });

    if (!res.ok) {
      return { active: false };
    }

    return res.json() as Promise<IntrospectionResult>;
  }

  /**
   * Check a ReBAC permission via the authz service.
   */
  async check(req: CheckRequest): Promise<CheckResponse> {
    const res = await fetch(`${this.baseUrl}/authz/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    if (!res.ok) {
      throw new Error(`Permission check failed: ${res.status}`);
    }

    return res.json() as Promise<CheckResponse>;
  }

  /**
   * List objects a user has a relation to.
   */
  async listObjects(req: ListObjectsRequest): Promise<ListObjectsResponse> {
    const res = await fetch(`${this.baseUrl}/authz/list-objects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    if (!res.ok) {
      throw new Error(`List objects failed: ${res.status}`);
    }

    return res.json() as Promise<ListObjectsResponse>;
  }

  /**
   * Express/Koa middleware that validates the Bearer token on each request.
   * Attaches `req.user` with token claims if valid.
   */
  authenticate() {
    return async (req: any, res: any, next: any) => {
      const authHeader = req.headers?.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or invalid authorization header' });
      }

      const token = authHeader.slice(7);
      try {
        const result = await this.introspect(token);
        if (!result.active) {
          return res.status(401).json({ error: 'Token is not active' });
        }
        req.user = {
          id: result.sub,
          tenantId: result.tenant_id,
          email: result.email,
          scopes: result.scopes,
        };
        next();
      } catch (err) {
        return res.status(401).json({ error: 'Token validation failed' });
      }
    };
  }
}
