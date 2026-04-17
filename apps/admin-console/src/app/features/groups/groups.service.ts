import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

export interface Group {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  description?: string;
  isManaged: boolean;
  source?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  memberships?: GroupMembership[];
}

export interface GroupMembership {
  id: string;
  userId: string;
  role: string;
  createdAt: string;
}

export interface GroupsResponse {
  data: Group[];
  total: number;
  page: number;
  pageSize: number;
}

@Injectable({ providedIn: 'root' })
export class GroupsService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.adminApiUrl}/api/v1/groups`;

  list(page = 1, pageSize = 20) {
    return this.http.get<GroupsResponse>(this.baseUrl, { params: { page, pageSize } });
  }

  get(id: string) {
    return this.http.get<Group>(`${this.baseUrl}/${id}`);
  }

  create(dto: { name: string; slug: string; description?: string }) {
    return this.http.post<Group>(this.baseUrl, dto);
  }

  delete(id: string) {
    return this.http.delete<Group>(`${this.baseUrl}/${id}`);
  }

  addMember(groupId: string, userId: string, role = 'member') {
    return this.http.post(`${this.baseUrl}/${groupId}/members`, { userId, role });
  }

  removeMember(groupId: string, userId: string) {
    return this.http.delete(`${this.baseUrl}/${groupId}/members/${userId}`);
  }
}
