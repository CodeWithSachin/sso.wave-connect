import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../environments/environment';

export interface AuditEvent {
  id: string;
  tenantId: string;
  actorId: string;
  actorType: string;
  actorIp: string;
  action: string;
  resourceType: string;
  resourceId: string;
  description?: string;
  createdAt: string;
}

export interface AuditResponse {
  data: AuditEvent[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AuditFilters {
  startDate?: string;
  endDate?: string;
  action?: string;
  resourceType?: string;
  actorId?: string;
}

@Injectable({ providedIn: 'root' })
export class AuditService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.auditServiceUrl}/api/v1/audit-logs`;

  list(filters: AuditFilters, page = 1, pageSize = 20) {
    // Audit service requires date range for partition pruning — default to last 30 days
    const endDate = filters.endDate ?? new Date().toISOString();
    const startDate =
      filters.startDate ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    let params = new HttpParams()
      .set('page', page)
      .set('pageSize', pageSize)
      .set('startDate', startDate)
      .set('endDate', endDate);
    if (filters.action) params = params.set('action', filters.action);
    if (filters.resourceType) params = params.set('resourceType', filters.resourceType);
    if (filters.actorId) params = params.set('actorId', filters.actorId);
    return this.http.get<AuditResponse>(this.baseUrl, { params });
  }
}
