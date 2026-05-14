import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type MigrationStatus =
	| 'pending'
	| 'accepted'
	| 'declined'
	| 'expired'
	| 'force_notified'
	| 'force_moved';

/**
 * Migration row as returned by GET /tenants/:tenantId/migrations.
 * Mirrors the JSON the Go handler emits in
 * `apps/identity-service/internal/handler/migration.go`.
 */
export interface Migration {
	id: string;
	user_id: string;
	from_tenant_id: string;
	domain: string;
	status: MigrationStatus | string;
	offered_at: string;
	responded_at: string | null;
	expires_at: string;
	force_notified_at: string | null;
}

export interface MigrationsListResponse {
	migrations: Migration[];
}

/**
 * Thin HttpClient wrapper for tenant-domain migrations (post-claim ownership
 * transfer). Backend lives on identity-service (port 3000).
 *
 * Backend gates these via OpenFGA `RequireOrgRelation(RelAdmin)` — admins
 * can list + notify-force; only owners can force.
 */
@Injectable({ providedIn: 'root' })
export class MigrationsService {
	private readonly http = inject(HttpClient);
	private readonly origin = environment.identityServiceUrl;

	private base(tenantId: string): string {
		return `${this.origin}/tenants/${tenantId}/migrations`;
	}

	list(tenantId: string): Observable<MigrationsListResponse> {
		return this.http.get<MigrationsListResponse>(this.base(tenantId), {
			withCredentials: true,
		});
	}

	notifyForce(tenantId: string, migrationId: string): Observable<void> {
		return this.http.post<void>(
			`${this.base(tenantId)}/${migrationId}/notify-force`,
			{},
			{ withCredentials: true },
		);
	}

	force(tenantId: string, migrationId: string): Observable<void> {
		return this.http.post<void>(
			`${this.base(tenantId)}/${migrationId}/force`,
			{},
			{ withCredentials: true },
		);
	}
}
