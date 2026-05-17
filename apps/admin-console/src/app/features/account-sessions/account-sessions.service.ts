import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

/**
 * A row in the sessions list, mirroring identity-service's model.SessionDTO.
 * `revokedAt` is set on revoked sessions; the API also omits expired sessions
 * by default, so absence implies "still valid".
 */
export interface SessionRow {
	id: string;
	ipAddress: string | null;
	userAgent: string | null;
	lastActivityAt: string | null;
	createdAt: string;
	expiresAt: string;
	revokedAt: string | null;
	// Server marks the caller's own session — used to badge the "current" row
	// and disable the revoke button (revoking your own session would log
	// you out mid-action).
	isCurrent?: boolean;
}

export interface SessionsListResponse {
	sessions: SessionRow[];
}

/**
 * Thin HTTP wrapper for identity-service /sessions endpoints.
 *
 * GET    /sessions       — list the current user's active sessions
 * DELETE /sessions/:id   — revoke a session by id
 *
 * All requests carry the sso_session cookie via `withCredentials`; CORS on
 * /sessions is open per-route in identity-service.
 */
@Injectable({ providedIn: 'root' })
export class AccountSessionsService {
	private readonly http = inject(HttpClient);
	private readonly base = `${environment.identityServiceUrl}/sessions`;

	list(): Observable<SessionsListResponse> {
		return this.http.get<SessionsListResponse>(this.base, {
			withCredentials: true,
		});
	}

	revoke(id: string): Observable<unknown> {
		return this.http.delete(`${this.base}/${id}`, {
			withCredentials: true,
		});
	}
}
