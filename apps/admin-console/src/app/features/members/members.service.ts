import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

export interface User {
  id: string;
  email: string;
  emailVerified: boolean;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  status: string;
  // Nullable in the DB; UserResponseDto on admin-api may return null/empty.
  // Typed nullable so the template's `?? '—'` fallback isn't flagged as
  // dead by the Angular compiler (NG8102).
  locale: string | null;
  timezone: string | null;
  lastLoginAt?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface MembersResponse {
  data: User[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateUserDto {
  email: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  status?: string;
}

@Injectable({ providedIn: 'root' })
export class MembersService {
  private http = inject(HttpClient);
  // Tenant is now derived server-side from the sso_session cookie by SessionCookieGuard.
  private baseUrl = `${environment.adminApiUrl}/api/v1/users`;

  list(page = 1, pageSize = 20) {
    return this.http.get<MembersResponse>(this.baseUrl, { params: { page, pageSize } });
  }

  /** Fetch a single member by id — used by /members/:id detail page. */
  get(id: string) {
    return this.http.get<User>(`${this.baseUrl}/${id}`, { withCredentials: true });
  }

  create(dto: CreateUserDto) {
    return this.http.post<User>(this.baseUrl, dto);
  }

  update(id: string, dto: Partial<User> & { version: number }) {
    return this.http.patch<User>(`${this.baseUrl}/${id}`, dto);
  }

  delete(id: string) {
    return this.http.delete<User>(`${this.baseUrl}/${id}`);
  }
}
