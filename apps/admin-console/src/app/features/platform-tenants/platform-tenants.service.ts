import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

/**
 * Tenant row as returned by admin-api `GET /api/v1/tenants`. Only the fields
 * the platform-tenants list actually renders are typed here — TenantResponseDto
 * is the source of truth on the backend.
 */
export interface PlatformTenant {
	id: string;
	name: string;
	slug: string;
	displayName: string | null;
	domain: string | null;
	plan: string;
	maxUsers: number | null;
	maxApps: number | null;
	dataResidency: string | null;
	createdAt: string;
	updatedAt: string;
	deletedAt?: string | null;
}

export interface PaginatedTenantsResponse {
	data: PlatformTenant[];
	total: number;
	page: number;
	pageSize: number;
}

/**
 * Thin wrapper over admin-api's tenant CRUD. The controller is guarded by
 * `PlatformAdminGuard` server-side; we still gate the route with
 * `requireCapability(['view_platform_admins'])` so the link is hidden for
 * non-platform users (UX gate; backend is authoritative).
 */
@Injectable({ providedIn: 'root' })
export class PlatformTenantsService {
	private readonly http = inject(HttpClient);
	private readonly base = `${environment.adminApiUrl}/api/v1/tenants`;

	list(page = 1, pageSize = 50): Observable<PaginatedTenantsResponse> {
		return this.http.get<PaginatedTenantsResponse>(this.base, {
			withCredentials: true,
			params: { page, pageSize },
		});
	}

	get(id: string): Observable<PlatformTenant> {
		return this.http.get<PlatformTenant>(`${this.base}/${id}`, {
			withCredentials: true,
		});
	}
}
