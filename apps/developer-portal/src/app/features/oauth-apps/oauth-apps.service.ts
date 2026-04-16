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

  list(page = 1, pageSize = 20) {
    return this.http.get<OAuthAppsResponse>(this.baseUrl, { params: { page, pageSize } });
  }

  create(dto: { name: string; redirect_uris: string[]; allowed_scopes?: string[] }) {
    return this.http.post<{ id: string; client_id: string; client_secret: string; name: string }>(this.baseUrl, dto);
  }

  rotateSecret(id: string) {
    return this.http.post<{ client_secret: string }>(`${this.baseUrl}/${id}/rotate-secret`, {});
  }

  delete(id: string) {
    return this.http.delete(`${this.baseUrl}/${id}`);
  }
}
