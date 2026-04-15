// SSO Platform — SCIM 2.0 Types

export const SCIM_USER_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:User';
export const SCIM_GROUP_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:Group';
export const SCIM_LIST_SCHEMA =
  'urn:ietf:params:scim:api:messages:2.0:ListResponse';
export const SCIM_ERROR_SCHEMA =
  'urn:ietf:params:scim:api:messages:2.0:Error';
export const SCIM_PATCH_SCHEMA =
  'urn:ietf:params:scim:api:messages:2.0:PatchOp';

export interface ScimEmail {
  value: string;
  type?: string;
  primary?: boolean;
}

export interface ScimName {
  givenName?: string;
  familyName?: string;
  formatted?: string;
}

export interface ScimUser {
  schemas: string[];
  id: string;
  externalId?: string;
  userName: string;
  name?: ScimName;
  displayName: string;
  emails?: ScimEmail[];
  active: boolean;
  meta: ScimMeta;
}

export interface ScimGroup {
  schemas: string[];
  id: string;
  externalId?: string;
  displayName: string;
  members: ScimGroupMember[];
  meta: ScimMeta;
}

export interface ScimGroupMember {
  value: string;
  display?: string;
  type?: string;
}

export interface ScimMeta {
  resourceType: string;
  created: string;
  lastModified: string;
  location: string;
}

export interface ScimListResponse<T> {
  schemas: string[];
  totalResults: number;
  startIndex: number;
  itemsPerPage: number;
  Resources: T[];
}

export interface ScimErrorResponse {
  schemas: string[];
  status: string;
  scimType?: string;
  detail: string;
}

export interface ScimPatchOperation {
  op: 'add' | 'remove' | 'replace';
  path?: string;
  value?: unknown;
}

export interface ScimPatchRequest {
  schemas: string[];
  Operations: ScimPatchOperation[];
}
