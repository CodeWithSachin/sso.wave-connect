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
  locale: string;
  timezone: string;
  lastLoginAt?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface UsersResponse {
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
export class UsersService {
  private http = inject(HttpClient);
  private get baseUrl() {
    const tid = sessionStorage.getItem('tenantId') ?? '';
    return `${environment.adminApiUrl}/api/v1/tenants/${tid}/users`;
  }

  list(page = 1, pageSize = 20) {
    return this.http.get<UsersResponse>(this.baseUrl, { params: { page, pageSize } });
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
