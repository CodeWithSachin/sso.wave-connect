import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { SessionMeDto } from '@sso-platform/shared-types';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

/**
 * Thin HttpClient wrapper for developer-portal-api's
 * `GET /api/v1/session/me`. Mirrors admin-console's `SessionService`; the
 * shared `SessionMeDto` shape lets the developer-portal's `SessionStore`
 * reuse the same hydration logic by structural typing.
 *
 * `withCredentials: true` is required so the sso_session cookie rides
 * cross-origin from :4302 → :3500.
 */
@Injectable({ providedIn: 'root' })
export class SessionService {
	private readonly http = inject(HttpClient);
	private readonly baseUrl = `${environment.devPortalApiUrl}/api/v1/session`;

	getMe(): Observable<SessionMeDto> {
		return this.http.get<SessionMeDto>(`${this.baseUrl}/me`, {
			withCredentials: true,
		});
	}
}
