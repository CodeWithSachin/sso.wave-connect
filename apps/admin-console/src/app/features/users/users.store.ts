import { inject } from '@angular/core';
import { signalStore, withState, withMethods, withHooks, patchState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import { MessageService } from 'primeng/api';
import { UsersService, User, CreateUserDto } from './users.service';

interface UsersState {
  users: User[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  dialogVisible: boolean;
}

export const UsersStore = signalStore(
  withState<UsersState>({
    users: [],
    total: 0,
    page: 1,
    pageSize: 20,
    loading: true,
    dialogVisible: false,
  }),
  withMethods((store) => {
    const svc = inject(UsersService);
    const msg = inject(MessageService);
    return {
      async loadUsers(page?: number) {
        const p = page ?? store.page();
        patchState(store, { loading: true, page: p });
        try {
          const res = await firstValueFrom(svc.list(p, store.pageSize()));
          patchState(store, { users: res.data ?? [], total: res.total ?? 0, loading: false });
        } catch {
          patchState(store, { loading: false });
          msg.add({ severity: 'error', summary: 'Error', detail: 'Failed to load users' });
        }
      },
      async createUser(dto: CreateUserDto) {
        try {
          await firstValueFrom(svc.create(dto));
          msg.add({ severity: 'success', summary: 'Success', detail: 'User invited successfully' });
          patchState(store, { dialogVisible: false });
          // Reload
          const res = await firstValueFrom(svc.list(store.page(), store.pageSize()));
          patchState(store, { users: res.data ?? [], total: res.total ?? 0 });
        } catch {
          msg.add({ severity: 'error', summary: 'Error', detail: 'Failed to create user' });
        }
      },
      async updateUserStatus(user: User, status: string) {
        try {
          await firstValueFrom(svc.update(user.id, { status, version: user.version }));
          msg.add({ severity: 'success', summary: 'Success', detail: `User ${status}` });
          const res = await firstValueFrom(svc.list(store.page(), store.pageSize()));
          patchState(store, { users: res.data ?? [], total: res.total ?? 0 });
        } catch {
          msg.add({ severity: 'error', summary: 'Error', detail: 'Failed to update user' });
        }
      },
      async deleteUser(user: User) {
        try {
          await firstValueFrom(svc.delete(user.id));
          msg.add({ severity: 'success', summary: 'Success', detail: 'User removed' });
          const res = await firstValueFrom(svc.list(store.page(), store.pageSize()));
          patchState(store, { users: res.data ?? [], total: res.total ?? 0 });
        } catch {
          msg.add({ severity: 'error', summary: 'Error', detail: 'Failed to remove user' });
        }
      },
      showDialog() {
        patchState(store, { dialogVisible: true });
      },
      hideDialog() {
        patchState(store, { dialogVisible: false });
      },
    };
  }),
  withHooks({
    onInit(store) {
      store.loadUsers();
    },
  }),
);
