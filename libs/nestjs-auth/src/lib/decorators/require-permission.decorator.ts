import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'required_permission';

export interface PermissionMetadata {
  relation: string;
  objectType: string;
  objectParam?: string;
}

export const RequirePermission = (
  relation: string,
  objectType: string,
  objectParam = 'id'
) =>
  SetMetadata(PERMISSION_KEY, {
    relation,
    objectType,
    objectParam,
  } as PermissionMetadata);
