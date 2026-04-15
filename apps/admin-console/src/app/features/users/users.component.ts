import { Component, signal, resource } from '@angular/core';
import { environment } from '../../environments/environment';

interface User {
  id: string;
  email: string;
  display_name: string;
  status: string;
  created_at: string;
}

interface UsersResponse {
  data: User[];
  total: number;
  page: number;
  pageSize: number;
}

@Component({
  selector: 'app-users',
  standalone: true,
  template: `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <h2 class="text-2xl font-semibold text-foreground">Users</h2>
        <button
          class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Invite User
        </button>
      </div>

      <!-- Users Table -->
      <div class="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <table class="w-full text-left text-sm">
          <thead class="border-b border-border bg-muted/30">
            <tr>
              <th class="px-6 py-3 font-medium text-muted-foreground">Email</th>
              <th class="px-6 py-3 font-medium text-muted-foreground">Display Name</th>
              <th class="px-6 py-3 font-medium text-muted-foreground">Status</th>
              <th class="px-6 py-3 font-medium text-muted-foreground">Joined</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            @if (usersResource.isLoading()) {
              <tr>
                <td colspan="4" class="px-6 py-8 text-center text-muted-foreground">
                  Loading...
                </td>
              </tr>
            } @else {
              @for (user of users(); track user.id) {
                <tr class="hover:bg-muted/20 transition-colors">
                  <td class="px-6 py-4 text-foreground">{{ user.email }}</td>
                  <td class="px-6 py-4 text-foreground">{{ user.display_name }}</td>
                  <td class="px-6 py-4">
                    <span
                      class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                      [class]="user.status === 'active' ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'"
                    >
                      {{ user.status }}
                    </span>
                  </td>
                  <td class="px-6 py-4 text-muted-foreground">{{ user.created_at }}</td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="4" class="px-6 py-8 text-center text-muted-foreground">
                    No users found
                  </td>
                </tr>
              }
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class UsersComponent {
  private readonly page = signal(1);

  usersResource = resource<UsersResponse, number>({
    params: () => this.page(),
    loader: async ({ params: page, abortSignal }) => {
      const tenantId = sessionStorage.getItem('tenantId') ?? '';
      const resp = await fetch(
        `${environment.adminApiUrl}/api/v1/tenants/${tenantId}/users?page=${page}&pageSize=20`,
        {
          headers: {
            Authorization: `Bearer ${sessionStorage.getItem('accessToken') ?? ''}`,
            'X-Tenant-ID': tenantId,
          },
          signal: abortSignal,
        },
      );
      return (await resp.json()) as UsersResponse;
    },
  });

  users = () => this.usersResource.value()?.data ?? [];
}
