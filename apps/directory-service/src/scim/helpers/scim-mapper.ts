import {
  ScimUserResource,
  SCIM_USER_SCHEMA,
  ScimEmail,
  ScimName,
} from '../dto/scim-user.dto';
import {
  ScimGroupResource,
  ScimGroupMember,
  SCIM_GROUP_SCHEMA,
} from '../dto/scim-group.dto';

/**
 * Maps an internal user DB row to a SCIM User Resource.
 */
export function toScimUser(
  user: {
    id: string;
    email: string;
    display_name: string;
    first_name?: string | null;
    last_name?: string | null;
    status: string;
    external_id?: string | null;
    created_at: Date;
    updated_at: Date;
  },
  baseUrl: string,
): ScimUserResource {
  const emails: ScimEmail[] = [
    { value: user.email, type: 'work', primary: true },
  ];

  const name: ScimName = {};
  if (user.first_name) name.givenName = user.first_name;
  if (user.last_name) name.familyName = user.last_name;
  if (user.first_name || user.last_name) {
    name.formatted = [user.first_name, user.last_name]
      .filter(Boolean)
      .join(' ');
  }

  return {
    schemas: [SCIM_USER_SCHEMA],
    id: user.id,
    externalId: user.external_id ?? undefined,
    userName: user.email,
    name: Object.keys(name).length > 0 ? name : undefined,
    displayName: user.display_name,
    emails,
    active: user.status === 'active',
    meta: {
      resourceType: 'User',
      created: user.created_at.toISOString(),
      lastModified: user.updated_at.toISOString(),
      location: `${baseUrl}/scim/v2/Users/${user.id}`,
    },
  };
}

/**
 * Maps an internal group DB row + members to a SCIM Group Resource.
 */
export function toScimGroup(
  group: {
    id: string;
    name: string;
    external_id?: string | null;
    created_at: Date;
    updated_at: Date;
  },
  members: { user_id: string; display_name: string }[],
  baseUrl: string,
): ScimGroupResource {
  const scimMembers: ScimGroupMember[] = members.map((m) => ({
    value: m.user_id,
    display: m.display_name,
    type: 'User',
  }));

  return {
    schemas: [SCIM_GROUP_SCHEMA],
    id: group.id,
    externalId: group.external_id ?? undefined,
    displayName: group.name,
    members: scimMembers,
    meta: {
      resourceType: 'Group',
      created: group.created_at.toISOString(),
      lastModified: group.updated_at.toISOString(),
      location: `${baseUrl}/scim/v2/Groups/${group.id}`,
    },
  };
}
