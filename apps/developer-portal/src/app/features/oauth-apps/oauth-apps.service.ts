import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

export interface OAuthApp {
  id: string;
  clientId: string;
  name: string;
  redirectUris: string[];
  allowedScopes: string[];
  isActive: boolean;
  createdAt: string;
}

export interface OAuthAppsResponse {
  data: OAuthApp[];
  total: number;
}

@Injectable({ providedIn: 'root' })
export class OAuthAppsService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.devPortalApiUrl}/api/v1/oauth-apps`;

  list(page = 1, pageSize = 20, search?: string) {
    const params: Record<string, string | number> = { page, pageSize };
    if (search?.trim()) params['search'] = search.trim();
    return this.http.get<OAuthAppsResponse>(this.baseUrl, { params });
  }

  create(dto: { name: string; redirect_uris: string[]; allowed_scopes?: string[] }) {
    return this.http.post<{ id: string; client_id: string; client_secret: string; name: string }>(this.baseUrl, dto);
  }

  rotateSecret(id: string) {
    return this.http.post<{ client_secret: string }>(`${this.baseUrl}/${id}/rotate-secret`, {});
  }

  /**
   * Update mutable fields. Backend treats omitted fields as no-ops, so
   * passing just `{ name }` won't blank out redirect URIs.
   */
  update(id: string, dto: { name?: string; redirect_uris?: string[]; allowed_scopes?: string[] }) {
    return this.http.patch<OAuthApp>(`${this.baseUrl}/${id}`, dto);
  }

  delete(id: string) {
    return this.http.delete(`${this.baseUrl}/${id}`);
  }
}
