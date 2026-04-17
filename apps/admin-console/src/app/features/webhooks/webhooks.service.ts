import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

export interface WebhookEndpoint {
  id: string;
  tenantId: string;
  url: string;
  description?: string;
  subscribedEvents: string[];
  isActive: boolean;
  failureCount: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface WebhooksResponse {
  data: WebhookEndpoint[];
  total: number;
}

export interface CreateWebhookDto {
  url: string;
  description?: string;
  subscribedEvents: string[];
}

export const WEBHOOK_EVENT_TYPES = [
  'user.created', 'user.updated', 'user.deleted', 'user.login', 'user.mfa_enrolled',
  'membership.created', 'membership.deleted',
  'group.created', 'group.updated', 'group.member_added', 'group.member_removed',
  'permission.granted', 'permission.revoked',
  'session.created', 'session.revoked',
];

@Injectable({ providedIn: 'root' })
export class WebhooksService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.webhookServiceUrl}/api/v1/webhooks`;

  list(page = 1, pageSize = 20) {
    return this.http.get<WebhooksResponse>(this.baseUrl, { params: { page, pageSize } });
  }

  create(dto: CreateWebhookDto) {
    return this.http.post<WebhookEndpoint & { secret?: string }>(this.baseUrl, dto);
  }

  update(id: string, dto: Partial<WebhookEndpoint> & { version: number }) {
    return this.http.patch<WebhookEndpoint>(`${this.baseUrl}/${id}`, dto);
  }

  delete(id: string) {
    return this.http.delete(`${this.baseUrl}/${id}`);
  }
}
