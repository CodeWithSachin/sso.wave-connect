import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

export interface ScimToken {
  id: string;
  tokenPrefix: string;
  label?: string;
  isActive: boolean;
  lastUsedAt?: string;
  expiresAt?: string;
  createdAt: string;
}

export interface ScimSyncLog {
  id: string;
  operation: string;
  resourceType: string;
  resourceId: string;
  status: string;
  errorMessage?: string;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class ScimService {
  private http = inject(HttpClient);
  private get baseUrl() {
    return `${environment.directoryServiceUrl}/api/v1/scim-tokens`;
  }

  listTokens() {
    return this.http.get<{ data: ScimToken[] }>(this.baseUrl);
  }

  generateToken(label?: string) {
    return this.http.post<{ id: string; token: string; prefix: string }>(this.baseUrl, { label });
  }

  revokeToken(id: string) {
    return this.http.delete(`${this.baseUrl}/${id}`);
  }

  getSyncLogs(page = 1, pageSize = 20) {
    return this.http.get<{ data: ScimSyncLog[]; total: number }>(`${this.baseUrl}/sync-logs`, { params: { page, pageSize } });
  }
}
