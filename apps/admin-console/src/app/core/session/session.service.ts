import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { SessionMeDto } from '@sso-platform/shared-types';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

/**
 * Thin HttpClient wrapper for GET /api/v1/session/me. Pattern matches the
 * lean service shape used elsewhere in the app (groups.service.ts, etc.).
 *
 * `withCredentials: true` is required so the sso_session cookie rides
 * cross-origin from :4301 → :3100.
 */
@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.adminApiUrl}/api/v1/session`;

  getMe(): Observable<SessionMeDto> {
    return this.http.get<SessionMeDto>(`${this.baseUrl}/me`, {
      withCredentials: true,
    });
  }
}
