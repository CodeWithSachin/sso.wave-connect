# Phase 4 -- Admin Console Feature Pages

> **App**: `apps/admin-console` (Angular, port 4300)
> **Backend**: `apps/admin-api` (NestJS, port 3100) + audit-service (port 3200) + webhook-service (port 3400) + directory-service (port 3300)
> **Stack per page**: standalone component + `@ngrx/signals` SignalStore + Angular service (`HttpClient`)
> **UI toolkit**: Tailwind CSS utility classes, PrimeNG (`p-dialog`, `p-toggleSwitch`, `p-multiSelect`), `@ng-icons/core` (Heroicons)

---

## Architecture Pattern (all 7 pages follow this)

```
component.ts   -- template + local signals for form fields
    injects -> store (provided in component `providers:[]`)
store.ts        -- signalStore: state, methods (async), withHooks onInit
    injects -> service
service.ts      -- HttpClient calls, DTO/interface exports
```

- Stores use `patchState()` for immutable updates.
- Async methods use `await firstValueFrom(obs)` to bridge RxJS -> async/await.
- Toast notifications go through PrimeNG `MessageService` (injected inside the store).
- Confirmation dialogs use PrimeNG `ConfirmationService` (injected inside the component).
- `tenantId` is read from `sessionStorage.getItem('tenantId')` in every service.

---

## 1. Dashboard

**Path**: `features/dashboard/`
**Purpose**: High-level tenant overview with 4 stat cards and a recent activity feed.

### Stat Cards
| Card | Store field | Source |
|------|-------------|--------|
| Total Users | `totalUsers` | `GET /api/v1/tenants/:tid/users?page=1&pageSize=1` (reads `.total`) |
| Active Members | `activeSessions` | `GET /api/v1/tenants/:tid/memberships?page=1&pageSize=1` (reads `.total`) |
| Session Rate | `sessionRate` (computed) | `Math.round((activeSessions / totalUsers) * 100)` |
| MFA Enrolled | `mfaEnrolled` | Hardcoded to 0 (no API wired yet) |

### Recent Activity
- API: `GET {auditServiceUrl}/api/v1/tenants/:tid/audit-logs?page=1&pageSize=10`
- Loaded in a separate try/catch so the page still works if the audit service is down.
- Each event displays: `action`, `resourceType`, `actorId`, `createdAt` (via `DatePipe`).

### Store State Shape
```ts
interface DashboardState {
  totalUsers: number;
  activeSessions: number;
  totalGroups: number;
  mfaEnrolled: number;
  recentEvents: AuditEvent[];
  loading: boolean;
  error: string | null;
}
```

### Notable Details
- `DashboardService` talks to **two** different backends: `adminApiUrl` (users/memberships) and `auditServiceUrl` (audit-logs).
- The component uses no PrimeNG widgets -- pure Tailwind cards with `NgIcon` Heroicons.
- Loading state renders skeleton `animate-pulse` div placeholders.

---

## 2. Users

**Path**: `features/users/`
**Purpose**: CRUD table for tenant users with invite dialog.

### API Endpoints
| Method | Endpoint | Used For |
|--------|----------|----------|
| GET | `/api/v1/tenants/:tid/users?page=N&pageSize=20` | List (paginated) |
| POST | `/api/v1/tenants/:tid/users` | Invite / create |
| PATCH | `/api/v1/tenants/:tid/users/:id` | Update status (active/suspended), requires `version` |
| DELETE | `/api/v1/tenants/:tid/users/:id` | Remove user |

### PrimeNG Components
- `p-dialog` -- Invite User dialog (header: "Invite User", 28rem width)

### Store State Shape
```ts
interface UsersState {
  users: User[];
  total: number;
  page: number;
  pageSize: number;    // default 20
  loading: boolean;
  dialogVisible: boolean;
}
```

### Component Signals (local form state)
- `inviteEmail = signal('')`
- `inviteName = signal('')`
- `searchTerm = signal('')`

### Table Columns
User (avatar + email) | Status (color-coded badge) | Last Login | Joined | Actions (suspend/activate, delete)

### Notable Details
- Optimistic locking: `updateUserStatus()` sends `{ status, version: user.version }` in the PATCH body.
- Status colors: `active` = green, `suspended` = red, `pending` = amber.
- Avatar is generated from the first character of `displayName ?? email`.
- Manual pagination (prev/next buttons) -- not PrimeNG DataTable lazy loading. The table is a plain `<table>` with Tailwind classes.
- After every mutation (create/update/delete), the store re-fetches the full page list.

---

## 3. Groups

**Path**: `features/groups/`
**Purpose**: Manage groups and their memberships.

### API Endpoints
| Method | Endpoint | Used For |
|--------|----------|----------|
| GET | `/api/v1/tenants/:tid/groups?page=N&pageSize=20` | List groups |
| GET | `/api/v1/tenants/:tid/groups/:id` | Get group with memberships |
| POST | `/api/v1/tenants/:tid/groups` | Create group |
| DELETE | `/api/v1/tenants/:tid/groups/:id` | Delete group |
| POST | `/api/v1/tenants/:tid/groups/:id/members` | Add member (`{ userId, role }`) |
| DELETE | `/api/v1/tenants/:tid/groups/:id/members/:userId` | Remove member |

### PrimeNG Components
- `p-dialog` -- Create Group dialog (name, slug, description fields)
- `p-dialog` -- Members dialog (list members with remove buttons)

### Store State Shape
```ts
interface GroupsState {
  groups: Group[];
  total: number;
  page: number;
  loading: boolean;
  createDialogVisible: boolean;
  selectedGroup: Group | null;
  membersDialogVisible: boolean;
}
```

### Group Interface
```ts
interface Group {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  description?: string;
  isManaged: boolean;    // true = provisioned via SCIM/external, false = manual
  source?: string;
  version: number;
  memberships?: GroupMembership[];
}
```

### Table Columns
Name | Slug (mono font) | Description | Managed/Manual (badge) | Created | Actions (view members, delete)

### Notable Details
- `viewMembers()` fetches the full group by ID (which includes `memberships[]`) then opens the members dialog.
- `isManaged` flag distinguishes SCIM-provisioned groups from manually created ones.
- Adding members is wired in the service (`addMember`) but not yet exposed in the UI.

---

## 4. Policies

**Path**: `features/policies/`
**Purpose**: Single reactive form for all tenant security policies.

### API Endpoints
| Method | Endpoint | Used For |
|--------|----------|----------|
| GET | `/api/v1/tenants/:tid/settings/policies` | Load current policy |
| PATCH | `/api/v1/tenants/:tid/settings/policies` | Save changes (requires `version`) |

### PrimeNG Components
- `p-toggleSwitch` -- Boolean toggles (requireUpper, requireLower, requireNumber, requireSymbol, requireMfa, requireSso)
- `p-multiSelect` -- Allowed MFA Methods picker

### Store State Shape
```ts
interface PoliciesState {
  policy: TenantPolicy | null;
  loading: boolean;
  saving: boolean;
}
```

### TenantPolicy Interface (full field list)
```ts
interface TenantPolicy {
  id: string;
  tenantId: string;
  passwordMinLength: number;
  passwordRequireUpper: boolean;
  passwordRequireLower: boolean;
  passwordRequireNumber: boolean;
  passwordRequireSymbol: boolean;
  passwordRequireMfa: boolean;
  allowedMfaMethods: string[];     // ['totp','webauthn','sms','email','backup_code']
  sessionMaxAgeHours: number;
  idleTimeoutMinutes: number;
  maxSessionsPerUser: number;
  ipAllowlist: string[];           // CIDR notation
  allowedEmailDomains: string[];
  requireSso: boolean;
  passwordHistoryCount: number;
  lockoutThreshold: number;
  lockoutDurationMin: number;
  version: number;
}
```

### Form Sections
1. **Password Policy** -- minLength (number input), historyCount, lockoutThreshold, 4 toggle switches
2. **MFA Policy** -- requireMfa toggle, `p-multiSelect` for allowedMfaMethods (options: TOTP, WebAuthn, SMS, Email, Backup Codes)
3. **Session Policy** -- maxAge (hours), idleTimeout (minutes), maxSessions
4. **Access Control** -- requireSso toggle, email domains (chip-like input with Enter-to-add), IP allowlist (CIDR chip input with Enter-to-add)

### Notable Details
- **Optimistic locking**: PATCH includes `version`. On HTTP 409 Conflict, the store shows a warning toast and automatically reloads the latest policy.
- Form state is **not** Angular reactive forms -- each field is a standalone `signal()` in the component.
- An `effect()` syncs store policy data into form signals whenever the policy loads or reloads.
- The "Save Policies" button shows a spinner when `saving` is true.
- Email domains and IP allowlist use a manual chip pattern: type in input, press Enter to add, click X to remove. No PrimeNG Chips component.

---

## 5. Webhooks

**Path**: `features/webhooks/`
**Purpose**: Configure HTTP endpoints that receive real-time event notifications.

### API Endpoints (via webhook-service)
| Method | Endpoint | Used For |
|--------|----------|----------|
| GET | `{webhookServiceUrl}/api/v1/tenants/:tid/webhooks` | List endpoints |
| POST | `{webhookServiceUrl}/api/v1/tenants/:tid/webhooks` | Create endpoint (returns `secret` once) |
| PATCH | `{webhookServiceUrl}/api/v1/tenants/:tid/webhooks/:id` | Toggle active/disable (requires `version`) |
| DELETE | `{webhookServiceUrl}/api/v1/tenants/:tid/webhooks/:id` | Delete endpoint |

### PrimeNG Components
- `p-dialog` -- Add Endpoint dialog (URL, description, event multiSelect)
- `p-multiSelect` -- Event type picker

### Store State Shape
```ts
interface WebhooksState {
  endpoints: WebhookEndpoint[];
  total: number;
  loading: boolean;
  dialogVisible: boolean;
  newSecret: string | null;    // shown once after creation
}
```

### Available Event Types
```
user.created, user.updated, user.deleted, user.login, user.mfa_enrolled,
membership.created, membership.deleted,
group.created, group.updated, group.member_added, group.member_removed,
permission.granted, permission.revoked,
session.created, session.revoked
```

### Table Columns
URL + description | Events (up to 2 badges + overflow count) | Status (Active/Disabled) | Failures (red if > 0) | Actions (toggle, delete)

### Notable Details
- **Secret shown once**: After POST, the response includes `secret`. It appears in a green banner with a copy button. Once dismissed via `dismissSecret()`, it is gone forever.
- `toggleActive()` sends `{ isActive: !current, version }` -- optimistic locking.
- `failureCount` is displayed in red when > 0 as a health indicator.

---

## 6. Audit Log

**Path**: `features/audit/`
**Purpose**: Searchable, filterable audit trail of security events.

### API Endpoint
| Method | Endpoint | Used For |
|--------|----------|----------|
| GET | `{auditServiceUrl}/api/v1/tenants/:tid/audit-logs` | Query with filters |

**Query params**: `page`, `pageSize`, `startDate`, `endDate`, `action`, `resourceType`, `actorId`

### PrimeNG Components
None. Uses native HTML `<select>` dropdowns and `<input type="date">`.

### Store State Shape
```ts
interface AuditState {
  events: AuditEvent[];
  total: number;
  page: number;
  pageSize: number;    // default 20
  loading: boolean;
  filters: AuditFilters;
}

interface AuditFilters {
  startDate?: string;
  endDate?: string;
  action?: string;
  resourceType?: string;
  actorId?: string;
}
```

### Filter Bar
- Start Date (`<input type="date">`)
- End Date (`<input type="date">`)
- Action (dropdown: user.created, user.updated, user.deleted, user.login, group.created, permission.granted, permission.revoked, session.created)
- Resource Type (dropdown: user, group, membership, session, policy)
- Search button + Clear button

### Table Columns
Timestamp | Action (primary-colored badge) | Actor (mono ID + type) | Resource (type + mono ID) | IP Address (mono)

### Notable Details
- Does **not** auto-load on init -- the store has no `withHooks`. The user must select filters and click Search.
- Manual pagination with prev/next buttons and page number display.
- Empty state message changes based on whether the user has searched yet.

---

## 7. SCIM Provisioning

**Path**: `features/scim/`
**Purpose**: Manage SCIM 2.0 bearer tokens for IdP integration and view sync logs.

### API Endpoints (via directory-service)
| Method | Endpoint | Used For |
|--------|----------|----------|
| GET | `{directoryServiceUrl}/api/v1/scim-tokens` | List tokens |
| POST | `{directoryServiceUrl}/api/v1/scim-tokens` | Generate token (returns `token` once) |
| DELETE | `{directoryServiceUrl}/api/v1/scim-tokens/:id` | Revoke token |
| GET | `{directoryServiceUrl}/api/v1/scim-tokens/sync-logs` | List sync logs |

### PrimeNG Components
None. Uses native HTML tables. ConfirmationService for generate/revoke confirmations.

### Store State Shape
```ts
interface ScimState {
  tokens: ScimToken[];
  syncLogs: ScimSyncLog[];
  loading: boolean;
  newToken: string | null;   // shown once after generation
}
```

### Token Table Columns
Prefix (mono) | Label | Created | Last Used | Status (Active/Revoked badge) | Actions (revoke)

### Sync Log Table Columns
Timestamp | Operation | Resource (type + ID) | Status (success = green, failure = red)

### Notable Details
- **Token shown once**: After POST, the raw token appears in a green banner with copy button. Dismissed via `dismissToken()`.
- `loadData()` calls both `listTokens()` and `getSyncLogs()` in parallel via `Promise.all`.
- Generate token prompts a ConfirmationService dialog before proceeding.
- Revoke also uses ConfirmationService with a warning that it cannot be undone.

---

## Cross-Cutting Patterns

### Environment URLs
Services reference `environment.adminApiUrl`, `environment.auditServiceUrl`, `environment.webhookServiceUrl`, `environment.directoryServiceUrl` -- configured in `apps/admin-console/src/app/environments/`.

### Loading Skeletons
Every page renders skeleton rows (`animate-pulse` divs) while `loading` is true, then swaps to real data.

### Empty States
All tables show an icon + message when the data array is empty.

### Error Handling
Store catch blocks call `msg.add({ severity: 'error', ... })` for toast notifications. No errors are thrown to the component.
