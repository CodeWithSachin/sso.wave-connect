import { Injectable, computed, signal } from '@angular/core';
import { getTokenPayload } from './token.utils.js';

/**
 * Service that resolves the current tenant context from the URL and token.
 *
 * Tenant resolution strategy (in order of precedence):
 * 1. URL path segment: `/t/<slug>/...` extracts the slug from the path.
 * 2. Subdomain: `<slug>.example.com` extracts from the first subdomain part.
 *
 * The `tenantId` is read from the PASETO token's `tenant_id` claim and
 * updates whenever `refreshFromToken()` is called.
 */
@Injectable({ providedIn: 'root' })
export class TenantService {
  /** Internal writable signal for the tenant slug. */
  private readonly _tenantSlug = signal<string | null>(
    TenantService.extractSlugFromUrl(),
  );

  /** Internal writable signal for the tenant ID from the token. */
  private readonly _tenantId = signal<string | null>(
    TenantService.extractTenantIdFromToken(),
  );

  /** The current tenant slug derived from the URL path or subdomain. */
  readonly currentTenantSlug = computed(() => this._tenantSlug());

  /** The tenant ID extracted from the PASETO token payload. */
  readonly tenantId = computed(() => this._tenantId());

  /**
   * Re-evaluates the tenant slug from the current URL.
   * Call this after navigation if the tenant context may have changed.
   */
  refreshFromUrl(): void {
    this._tenantSlug.set(TenantService.extractSlugFromUrl());
  }

  /**
   * Re-reads the tenant ID from the stored access token.
   * Call this after login or token refresh.
   */
  refreshFromToken(): void {
    this._tenantId.set(TenantService.extractTenantIdFromToken());
  }

  /**
   * Extracts tenant slug from the URL.
   *
   * Checks path-based routing first (`/t/<slug>/...`),
   * then falls back to subdomain extraction.
   */
  private static extractSlugFromUrl(): string | null {
    // Path-based: /t/<slug>/...
    const pathMatch = window.location.pathname.match(/^\/t\/([^/]+)/);
    if (pathMatch?.[1]) {
      return pathMatch[1];
    }

    // Subdomain-based: <slug>.example.com
    const hostname = window.location.hostname;
    const parts = hostname.split('.');

    // Need at least 3 parts (slug.domain.tld) and not localhost
    if (parts.length >= 3 && !hostname.includes('localhost')) {
      return parts[0];
    }

    return null;
  }

  /**
   * Reads the `tenant_id` claim from the stored PASETO access token.
   */
  private static extractTenantIdFromToken(): string | null {
    const token = sessionStorage.getItem('accessToken');
    if (!token) {
      return null;
    }

    const payload = getTokenPayload(token);
    if (!payload) {
      return null;
    }

    const tenantId = payload['tenant_id'];
    return typeof tenantId === 'string' ? tenantId : null;
  }
}
