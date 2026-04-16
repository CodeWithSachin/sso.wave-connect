import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private http = inject(HttpClient);
  private baseUrl = environment.adminApiUrl;
  private auditUrl = environment.auditServiceUrl;

  private get tenantId() {
    return sessionStorage.getItem('tenantId') ?? '';
  }

  getUsers(pageSize = 1) {
    return this.http.get<{ data: unknown[]; total: number }>(
      `${this.baseUrl}/api/v1/tenants/${this.tenantId}/users`,
      { params: { page: 1, pageSize } },
    );
  }

  getMemberships(pageSize = 1) {
    return this.http.get<{ data: unknown[]; total: number }>(
      `${this.baseUrl}/api/v1/tenants/${this.tenantId}/memberships`,
      { params: { page: 1, pageSize } },
    );
  }

  getRecentAuditEvents(limit = 10) {
    // Audit service requires date range for partition pruning — default to last 30 days
    const endDate = new Date().toISOString();
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    return this.http.get<{ data: AuditEvent[]; total: number }>(
      `${this.auditUrl}/api/v1/tenants/${this.tenantId}/audit-logs`,
      { params: { page: 1, pageSize: limit, startDate, endDate } },
    );
  }
}

export interface AuditEvent {
  id: string;
  action: string;
  actorId: string;
  actorType: string;
  actorIp: string;
  resourceType: string;
  resourceId: string;
  description: string;
  createdAt: string;
}
