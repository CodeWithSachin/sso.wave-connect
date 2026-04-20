import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import type { PlatformAdminRole } from '@sso-platform/shared-types';
import { environment } from '../../environments/environment';

/**
 * Server response shape for the platform-admin list + detail endpoints.
 * Mirrors `PlatformAdminResponseDto` in apps/admin-api/src/platform-admins/dto.
 */
export interface PlatformAdminRow {
	userId: string;
	email: string;
	role: PlatformAdminRole;
	grantedAt: string;
	grantedBy: string | null;
	revokedAt: string | null;
	notes: string | null;
}

export interface PlatformAdminListResponse {
	data: PlatformAdminRow[];
	total: number;
}

export interface GrantPlatformAdminPayload {
	userId: string;
	role: PlatformAdminRole;
	notes?: string;
}

/**
 * Thin HttpClient wrapper for /api/v1/platform/admins.
 *
 * Backend endpoints (existing — see apps/admin-api/src/platform-admins/platform-admins.controller.ts):
 *   POST   /api/v1/platform/admins         — grant (super-admin only)
 *   GET    /api/v1/platform/admins         — list active grants
 *   GET    /api/v1/platform/admins/:userId — single grant
 *   DELETE /api/v1/platform/admins/:userId — revoke (super-admin only)
 *
 * `withCredentials: true` is required so the sso_session cookie rides
 * cross-origin from :4301 → :3100. Backend SessionCookieGuard +
 * PlatformAdminGuard enforce auth; this layer just forwards.
 */
@Injectable({ providedIn: 'root' })
export class PlatformAdminsService {
	private readonly http = inject(HttpClient);
	private readonly baseUrl = `${environment.adminApiUrl}/api/v1/platform/admins`;

	list(): Observable<PlatformAdminListResponse> {
		return this.http.get<PlatformAdminListResponse>(this.baseUrl, {
			withCredentials: true,
		});
	}

	grant(payload: GrantPlatformAdminPayload): Observable<PlatformAdminRow> {
		return this.http.post<PlatformAdminRow>(this.baseUrl, payload, {
			withCredentials: true,
		});
	}

	revoke(userId: string): Observable<PlatformAdminRow> {
		return this.http.delete<PlatformAdminRow>(`${this.baseUrl}/${userId}`, {
			withCredentials: true,
		});
	}
}
