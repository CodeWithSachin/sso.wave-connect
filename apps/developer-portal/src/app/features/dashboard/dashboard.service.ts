import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private http = inject(HttpClient);
  private baseUrl = environment.devPortalApiUrl;
  private auditBaseUrl = environment.auditServiceUrl;

  getApiKeys() {
    return this.http.get<{ data: unknown[]; total: number }>(`${this.baseUrl}/api/v1/api-keys`, { params: { page: 1, pageSize: 1 } });
  }

  getOAuthApps() {
    return this.http.get<{ data: unknown[]; total: number }>(`${this.baseUrl}/api/v1/oauth-apps`, { params: { page: 1, pageSize: 1 } });
  }

  /**
   * Coarse 30-day API request count, computed from audit-service events
   * whose action begins with `api_key.`. This is the closest proxy we have
   * until developer-portal-api ships a real usage aggregate endpoint —
   * see Plan v2 §2.7. The count is a metric, not a billing source.
   */
  getApiRequests30d() {
    // audit-service requires startDate + endDate (partition pruning). The
    // legacy `from` param it accepted disappeared in the partitioned-table
    // migration; we now pass an explicit closed range.
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    return this.http.get<{ data: unknown[]; total: number }>(
      `${this.auditBaseUrl}/api/v1/audit-logs`,
      {
        params: {
          action: 'api_key.request',
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          page: 1,
          pageSize: 1,
        },
      },
    );
  }
}
