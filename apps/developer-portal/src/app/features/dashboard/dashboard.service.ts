import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private http = inject(HttpClient);
  private baseUrl = environment.devPortalApiUrl;

  getApiKeys() {
    return this.http.get<{ data: unknown[]; total: number }>(`${this.baseUrl}/api/v1/api-keys`, { params: { page: 1, pageSize: 1 } });
  }

  getOAuthApps() {
    return this.http.get<{ data: unknown[]; total: number }>(`${this.baseUrl}/api/v1/oauth-apps`, { params: { page: 1, pageSize: 1 } });
  }
}
