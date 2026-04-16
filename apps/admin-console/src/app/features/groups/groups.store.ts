import { inject } from '@angular/core';
import { signalStore, withState, withMethods, withHooks, patchState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import { MessageService } from 'primeng/api';
import { GroupsService, Group } from './groups.service';

interface GroupsState {
  groups: Group[];
  total: number;
  page: number;
  loading: boolean;
  createDialogVisible: boolean;
  selectedGroup: Group | null;
  membersDialogVisible: boolean;
}

export const GroupsStore = signalStore(
  withState<GroupsState>({
    groups: [],
    total: 0,
    page: 1,
    loading: true,
    createDialogVisible: false,
    selectedGroup: null,
    membersDialogVisible: false,
  }),
  withMethods((store) => {
    const svc = inject(GroupsService);
    const msg = inject(MessageService);
    return {
      async loadGroups(page?: number) {
        const p = page ?? store.page();
        patchState(store, { loading: true, page: p });
        try {
          const res = await firstValueFrom(svc.list(p));
          patchState(store, { groups: res.data ?? [], total: res.total ?? 0, loading: false });
        } catch {
          patchState(store, { loading: false });
          msg.add({ severity: 'error', summary: 'Error', detail: 'Failed to load groups' });
        }
      },
      async createGroup(dto: { name: string; slug: string; description?: string }) {
        try {
          await firstValueFrom(svc.create(dto));
          msg.add({ severity: 'success', summary: 'Success', detail: 'Group created' });
          patchState(store, { createDialogVisible: false });
          const res = await firstValueFrom(svc.list(store.page()));
          patchState(store, { groups: res.data ?? [], total: res.total ?? 0 });
        } catch {
          msg.add({ severity: 'error', summary: 'Error', detail: 'Failed to create group' });
        }
      },
      async deleteGroup(group: Group) {
        try {
          await firstValueFrom(svc.delete(group.id));
          msg.add({ severity: 'success', summary: 'Success', detail: 'Group deleted' });
          const res = await firstValueFrom(svc.list(store.page()));
          patchState(store, { groups: res.data ?? [], total: res.total ?? 0 });
        } catch {
          msg.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete group' });
        }
      },
      async viewMembers(group: Group) {
        try {
          const full = await firstValueFrom(svc.get(group.id));
          patchState(store, { selectedGroup: full, membersDialogVisible: true });
        } catch {
          msg.add({ severity: 'error', summary: 'Error', detail: 'Failed to load group details' });
        }
      },
      async removeMember(groupId: string, userId: string) {
        try {
          await firstValueFrom(svc.removeMember(groupId, userId));
          msg.add({ severity: 'success', summary: 'Success', detail: 'Member removed' });
          const full = await firstValueFrom(svc.get(groupId));
          patchState(store, { selectedGroup: full });
        } catch {
          msg.add({ severity: 'error', summary: 'Error', detail: 'Failed to remove member' });
        }
      },
      showCreateDialog() { patchState(store, { createDialogVisible: true }); },
      hideCreateDialog() { patchState(store, { createDialogVisible: false }); },
      hideMembersDialog() { patchState(store, { membersDialogVisible: false, selectedGroup: null }); },
    };
  }),
  withHooks({
    onInit(store) { store.loadGroups(); },
  }),
);
