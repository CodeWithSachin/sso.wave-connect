import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import type { MembershipRole } from '@sso-platform/shared-types';
import { environment } from '../../environments/environment';

export type InvitationStatus = 'pending' | 'accepted' | 'expired';

/**
 * Membership row as returned by GET /api/v1/memberships. Includes the joined
 * user record. `joinedAt`, `invitationExpires`, and `deletedAt` together
 * encode the derived status — the server filter (Phase 6A) handles the
 * derivation; the UI just displays.
 */
export interface MembershipRow {
	id: string;
	tenantId: string;
	userId: string;
	role: MembershipRole;
	invitedBy: string | null;
	invitationToken: string | null;
	invitationExpires: string | null;
	joinedAt: string | null;
	createdAt: string;
	updatedAt: string;
	deletedAt: string | null;
	user: {
		id: string;
		email: string;
		displayName: string | null;
		avatarUrl: string | null;
	};
}

export interface PaginatedMembershipsResponse {
	data: MembershipRow[];
	total: number;
	page: number;
	pageSize: number;
}

/**
 * Thin HttpClient wrapper for /api/v1/memberships filtered by status.
 *
 * Backend endpoints (admin-api):
 *   GET   /api/v1/memberships?status=… — paginated list (Phase 6A added filter)
 *   POST  /api/v1/memberships/:id/resend — rotate token + extend + resend email
 *   DELETE /api/v1/memberships/:id — soft-delete (revoke an invitation)
 */
@Injectable({ providedIn: 'root' })
export class InvitationsService {
	private readonly http = inject(HttpClient);
	private readonly base = `${environment.adminApiUrl}/api/v1/memberships`;

	list(
		status: InvitationStatus,
		page = 1,
		pageSize = 50,
	): Observable<PaginatedMembershipsResponse> {
		return this.http.get<PaginatedMembershipsResponse>(this.base, {
			withCredentials: true,
			params: { status, page, pageSize },
		});
	}

	resend(id: string): Observable<MembershipRow> {
		return this.http.post<MembershipRow>(
			`${this.base}/${id}/resend`,
			{},
			{ withCredentials: true },
		);
	}

	revoke(id: string): Observable<MembershipRow> {
		return this.http.delete<MembershipRow>(`${this.base}/${id}`, {
			withCredentials: true,
		});
	}
}
