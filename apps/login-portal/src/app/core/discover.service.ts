import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

/**
 * Mode returned by `GET /auth/public/discover?email=…`.
 *
 *   consumer        — unclaimed domain; show our default password field.
 *   tenant_password — claimed org, password login allowed.
 *   tenant_sso      — claimed org requiring SSO; redirect to IdP.
 */
export type DiscoverMode = 'consumer' | 'tenant_password' | 'tenant_sso';

export interface DiscoverTenant {
  id: string;
  slug: string;
  name: string;
  display_name?: string;
  logo_url?: string;
}

export interface DiscoverSSO {
  idp_id: string;
  idp_type: string;
  name: string;
  login_url: string;
}

export interface DiscoverResponse {
  mode: DiscoverMode;
  tenant?: DiscoverTenant;
  sso?: DiscoverSSO;
}

/**
 * Thin client for the email-first login discovery endpoint. Consumed by the
 * login component's email-step to decide what the second step looks like
 * (password field, SSO redirect, etc.).
 *
 * Backend is enumeration-resistant: it returns 200 `{"mode":"consumer"}` for
 * malformed/unknown inputs. We mirror that by never throwing from `discover()`
 * — network errors also resolve to `consumer` so the UI degrades gracefully.
 */
@Injectable({ providedIn: 'root' })
export class DiscoverService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.identityServiceUrl;

  async discover(email: string): Promise<DiscoverResponse> {
    const trimmed = email.trim();
    if (!trimmed) {
      return { mode: 'consumer' };
    }
    try {
      const url =
        `${this.baseUrl}/auth/public/discover?email=` +
        encodeURIComponent(trimmed);
      return await firstValueFrom(this.http.get<DiscoverResponse>(url));
    } catch {
      return { mode: 'consumer' };
    }
  }
}
