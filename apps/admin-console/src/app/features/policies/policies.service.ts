import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

export interface TenantPolicy {
  id: string;
  tenantId: string;
  passwordMinLength: number;
  passwordRequireUpper: boolean;
  passwordRequireLower: boolean;
  passwordRequireNumber: boolean;
  passwordRequireSymbol: boolean;
  passwordRequireMfa: boolean;
  allowedMfaMethods: string[];
  sessionMaxAgeHours: number;
  idleTimeoutMinutes: number;
  maxSessionsPerUser: number;
  ipAllowlist: string[];
  allowedEmailDomains: string[];
  requireSso: boolean;
  passwordHistoryCount: number;
  lockoutThreshold: number;
  lockoutDurationMin: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

@Injectable({ providedIn: 'root' })
export class PoliciesService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.adminApiUrl}/api/v1/settings`;

  getPolicy() {
    return this.http.get<TenantPolicy>(`${this.baseUrl}/policies`);
  }

  updatePolicy(dto: Partial<TenantPolicy> & { version: number }) {
    return this.http.patch<TenantPolicy>(`${this.baseUrl}/policies`, dto);
  }
}
