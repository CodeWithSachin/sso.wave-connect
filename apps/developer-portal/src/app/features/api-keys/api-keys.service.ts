import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

export interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  status: string;
  scopes: string[];
  rateLimitPerMin?: number;
  lastUsedAt?: string;
  expiresAt?: string;
  createdAt: string;
}

export interface ApiKeysResponse {
  data: ApiKey[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateApiKeyDto {
  name: string;
  scopes?: string[];
  rate_limit_per_min?: number;
  expires_at?: string;
}

@Injectable({ providedIn: 'root' })
export class ApiKeysService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.devPortalApiUrl}/api/v1/api-keys`;

  list(page = 1, pageSize = 20, search?: string) {
    const params: Record<string, string | number> = { page, pageSize };
    if (search?.trim()) params['search'] = search.trim();
    return this.http.get<ApiKeysResponse>(this.baseUrl, { params });
  }

  create(dto: CreateApiKeyDto) {
    return this.http.post<{ id: string; key: string; prefix: string; name: string }>(this.baseUrl, dto);
  }

  revoke(id: string) {
    return this.http.delete(`${this.baseUrl}/${id}`);
  }

  getUsage(id: string) {
    return this.http.get<{ data: UsageMetric[] }>(`${this.baseUrl}/${id}/usage`);
  }

  /** Read one API key by id — used by /api-keys/:id detail page. */
  get(id: string) {
    return this.http.get<ApiKey>(`${this.baseUrl}/${id}`);
  }
}

export interface UsageMetric {
  date: string;
  requestCount: number;
  errorCount: number;
}
