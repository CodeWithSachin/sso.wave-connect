import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

/**
 * Subset of admin-api's TenantResponseDto rendered on the Settings page.
 * Keeping the shape narrow protects the UI from accidentally rendering
 * future backend fields without an explicit opt-in.
 */
export interface MyTenant {
	id: string;
	name: string;
	slug: string;
	displayName: string | null;
	domain: string | null;
	logoUrl: string | null;
	faviconUrl: string | null;
	plan: string;
	dataResidency: string | null;
	version: number;
	createdAt: string;
	updatedAt: string;
}

export interface UpdateMyTenantPayload {
	name?: string;
	displayName?: string | null;
	logoUrl?: string | null;
	faviconUrl?: string | null;
	/** Required for optimistic locking — admin-api rejects PATCH without it. */
	version: number;
}

/**
 * Thin wrapper for the self-service tenant endpoints. The backend is
 * `/api/v1/my-tenant` (see MyTenantController) — distinct from the
 * platform-admin `/api/v1/tenants/:id` which requires PlatformAdminGuard.
 */
@Injectable({ providedIn: 'root' })
export class SettingsService {
	private readonly http = inject(HttpClient);
	private readonly base = `${environment.adminApiUrl}/api/v1/my-tenant`;

	get(): Observable<MyTenant> {
		return this.http.get<MyTenant>(this.base, { withCredentials: true });
	}

	update(dto: UpdateMyTenantPayload): Observable<MyTenant> {
		return this.http.patch<MyTenant>(this.base, dto, {
			withCredentials: true,
		});
	}
}
