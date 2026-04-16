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
  private get baseUrl() {
    const tid = sessionStorage.getItem('tenantId') ?? '';
    return `${environment.auditServiceUrl}/api/v1/tenants/${tid}/audit-logs`;
  }

  list(filters: AuditFilters, page = 1, pageSize = 20) {
    let params = new HttpParams().set('page', page).set('pageSize', pageSize);
    if (filters.startDate) params = params.set('startDate', filters.startDate);
    if (filters.endDate) params = params.set('endDate', filters.endDate);
    if (filters.action) params = params.set('action', filters.action);
    if (filters.resourceType) params = params.set('resourceType', filters.resourceType);
    if (filters.actorId) params = params.set('actorId', filters.actorId);
    return this.http.get<AuditResponse>(this.baseUrl, { params });
  }
}
