import { computed, inject } from '@angular/core';
import {
  patchState,
  signalStore,
  withComputed,
  withMethods,
  withState,
} from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import { MessageService } from 'primeng/api';
import { SessionStore } from '../../core/session/session.store';
import { MembersService, type CreateUserDto, type User } from './members.service';

interface MembersState {
  page: number;
  pageSize: number;
  dialogVisible: boolean;
  submitting: boolean;
  error: string | null;
  /** Bumped on every mutation; component's resource() watches it as a re-fetch trigger. */
  mutationVersion: number;
}

const initialState: MembersState = {
  page: 1,
  pageSize: 20,
  dialogVisible: false,
  submitting: false,
  error: null,
  mutationVersion: 0,
};

/**
 * Holds page/dialog/mutation state for the Members page. Reads stay in the
 * component via `resource()`; this store only owns the imperative side
 * (POST/PATCH/DELETE) and the `mutationVersion` counter that triggers a
 * re-fetch when a mutation lands.
 *
 * Same shape as InvitationsStore / DomainsStore / SsoStore — see
 * docs/plans/admin-role-surfaces.md for the rationale.
 */
export const MembersStore = signalStore(
  withState(initialState),
  withComputed(() => {
    const session = inject(SessionStore);
    return {
      canMutate: computed(() => session.capabilities().includes('manage_members')),
    };
  }),
  withMethods((store) => {
    const svc = inject(MembersService);
    const msg = inject(MessageService);

    /** Bump the version → resource() in the component re-fetches the list. */
    function refresh(): void {
      patchState(store, { mutationVersion: store.mutationVersion() + 1 });
    }

    return {
      setPage(page: number): void {
        patchState(store, { page });
      },
      showDialog(): void {
        patchState(store, { dialogVisible: true, error: null });
      },
      hideDialog(): void {
        patchState(store, { dialogVisible: false });
      },
      clearError(): void {
        patchState(store, { error: null });
      },

      async createUser(dto: CreateUserDto): Promise<boolean> {
        patchState(store, { submitting: true, error: null });
        try {
          await firstValueFrom(svc.create(dto));
          patchState(store, { submitting: false, dialogVisible: false });
          msg.add({
            severity: 'success',
            summary: 'Success',
            detail: 'User invited successfully',
          });
          refresh();
          return true;
        } catch (err) {
          patchState(store, {
            submitting: false,
            error: parseHttpError(err) ?? 'Failed to create user',
          });
          msg.add({ severity: 'error', summary: 'Error', detail: 'Failed to create user' });
          return false;
        }
      },

      async updateUserStatus(user: User, status: string): Promise<boolean> {
        patchState(store, { submitting: true, error: null });
        try {
          await firstValueFrom(svc.update(user.id, { status, version: user.version }));
          patchState(store, { submitting: false });
          msg.add({ severity: 'success', summary: 'Success', detail: `User ${status}` });
          refresh();
          return true;
        } catch (err) {
          patchState(store, {
            submitting: false,
            error: parseHttpError(err) ?? 'Failed to update user',
          });
          msg.add({ severity: 'error', summary: 'Error', detail: 'Failed to update user' });
          return false;
        }
      },

      async deleteUser(user: User): Promise<boolean> {
        patchState(store, { submitting: true, error: null });
        try {
          await firstValueFrom(svc.delete(user.id));
          patchState(store, { submitting: false });
          msg.add({ severity: 'success', summary: 'Success', detail: 'User removed' });
          refresh();
          return true;
        } catch (err) {
          patchState(store, {
            submitting: false,
            error: parseHttpError(err) ?? 'Failed to remove user',
          });
          msg.add({ severity: 'error', summary: 'Error', detail: 'Failed to remove user' });
          return false;
        }
      },
    };
  }),
);

function parseHttpError(err: unknown): string | null {
  if (typeof err === 'object' && err !== null) {
    const e = err as { error?: { message?: string }; message?: string };
    return e.error?.message ?? e.message ?? null;
  }
  return null;
}
