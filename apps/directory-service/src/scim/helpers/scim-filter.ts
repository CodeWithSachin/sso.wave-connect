/**
 * Basic SCIM 2.0 filter parser.
 * Supports: attribute eq "value" (the most common filter from Okta/Azure AD).
 * E.g., userName eq "john@example.com", externalId eq "abc123"
 */
export interface ScimFilter {
  attribute: string;
  operator: string;
  value: string;
}

export function parseScimFilter(filter?: string): ScimFilter | null {
  if (!filter) return null;

  // Match: attribute op "value"
  const match = filter.match(/^(\w+)\s+(eq|ne|co|sw|ew)\s+"([^"]*)"$/i);
  if (!match) return null;

  return {
    attribute: match[1].toLowerCase(),
    operator: match[2].toLowerCase(),
    value: match[3],
  };
}

/**
 * Maps SCIM user attributes to database column names.
 */
export function mapScimUserAttribute(attr: string): string | null {
  const map: Record<string, string> = {
    username: 'email',
    externalid: 'external_id',
    displayname: 'display_name',
    'name.givenname': 'first_name',
    'name.familyname': 'last_name',
  };
  return map[attr.toLowerCase()] ?? null;
}
