# Phase 5 -- Developer Portal Feature Pages

> **App**: `apps/developer-portal` (Angular, port 4400)
> **Backend**: `apps/developer-portal-api` (NestJS, port 3500) + directory-service (port 3300)
> **Stack per page**: standalone component + `@ngrx/signals` SignalStore + Angular service (`HttpClient`)
> **UI toolkit**: Tailwind CSS utility classes, PrimeNG (`p-dialog`, `p-multiSelect`), `@ng-icons/core` (Heroicons)

---

## Architecture Pattern

Same as Admin Console (see KT/05). Each feature follows:

```
component.ts   -- template, local signal() fields for forms, copy-to-clipboard helper
    injects -> store (component-provided)
store.ts        -- signalStore with state, async methods, withHooks onInit
    injects -> service
service.ts      -- HttpClient calls to developer-portal-api
```

Key difference from Admin Console: the Developer Portal does NOT use tenant-scoped URLs. Services call `environment.devPortalApiUrl` directly (the backend resolves the tenant from the authenticated session).

---

## 1. Dashboard

**Path**: `features/dashboard/`
**Purpose**: Overview of developer resources with stat cards and quick-start navigation.

### Stat Cards
| Card | Store field | Source |
|------|-------------|--------|
| Active API Keys | `activeApiKeys` | `GET /api/v1/api-keys?page=1&pageSize=1` (reads `.total`) |
| OAuth Applications | `oauthAppCount` | `GET /api/v1/oauth-apps?page=1&pageSize=1` (reads `.total`) |
| API Requests (30d) | -- | Placeholder, shows dash (not wired to any API yet) |

### Quick Start Section
Two navigation cards using `routerLink`:
- **Create an API Key** -> `/api-keys`
- **View SDK Docs** -> `/docs`

### Store State Shape
```ts
interface DashboardState {
  activeApiKeys: number;
  oauthAppCount: number;
  loading: boolean;
}
```

### Notable Details
- `loadDashboard()` fires both API calls in parallel via `Promise.all`.
- No PrimeNG components used -- pure Tailwind cards with Heroicons.
- The "API Requests (30d)" card is a static placeholder.

---

## 2. API Keys

**Path**: `features/api-keys/`
**Purpose**: Create, list, and revoke API keys for server-to-server authentication.

### API Endpoints
| Method | Endpoint | Used For |
|--------|----------|----------|
| GET | `/api/v1/api-keys?page=N&pageSize=20` | List keys |
| POST | `/api/v1/api-keys` | Create key (returns `key` once) |
| DELETE | `/api/v1/api-keys/:id` | Revoke key |
| GET | `/api/v1/api-keys/:id/usage` | Get usage metrics (wired in service, not in UI) |

### Create API Key DTO
```ts
interface CreateApiKeyDto {
  name: string;
  scopes?: string[];
  rate_limit_per_min?: number;
  expires_at?: string;           // ISO 8601
}
```

### PrimeNG Components
- `p-dialog` -- Create API Key dialog (name, rate limit, expiration date)

### Store State Shape
```ts
interface ApiKeysState {
  keys: ApiKey[];
  total: number;
  page: number;
  loading: boolean;
  dialogVisible: boolean;
  newKey: string | null;        // shown once after creation
}
```

### ApiKey Interface
```ts
interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  status: string;               // 'active' | 'revoked'
  scopes: string[];
  rateLimitPerMin?: number;
  lastUsedAt?: string;
  expiresAt?: string;
  createdAt: string;
}
```

### Table Columns
Name | Key Prefix (mono, with "...") | Scopes (up to 3 badges) | Status (green/red badge) | Last Used | Actions (revoke if active)

### Notable Details
- **Key shown once**: After POST, the full API key appears in a green banner. Users must copy it immediately; it is never retrievable again. The banner includes a clipboard copy button.
- `expiresAt` is converted from the date input to ISO string before sending: `new Date(this.expiresAt()).toISOString()`.
- Revoke uses `ConfirmationService` dialog with a "cannot be undone" warning.
- The `getUsage()` service method exists but is not called from the component or store yet.

---

## 3. OAuth Applications

**Path**: `features/oauth-apps/`
**Purpose**: Register and manage OAuth 2.0 client applications.

### API Endpoints
| Method | Endpoint | Used For |
|--------|----------|----------|
| GET | `/api/v1/oauth-apps?page=N&pageSize=20` | List apps |
| POST | `/api/v1/oauth-apps` | Register app (returns `client_id` + `client_secret`) |
| POST | `/api/v1/oauth-apps/:id/rotate-secret` | Rotate client secret (returns new `client_secret`) |
| DELETE | `/api/v1/oauth-apps/:id` | Delete app |

### Create App DTO
```ts
{ name: string; redirect_uris: string[]; allowed_scopes?: string[] }
```

### PrimeNG Components
- `p-dialog` -- Register OAuth App dialog (name, redirect URIs multi-input)

### Store State Shape
```ts
interface OAuthAppsState {
  apps: OAuthApp[];
  total: number;
  loading: boolean;
  dialogVisible: boolean;
  newCredentials: { clientId: string; clientSecret: string } | null;
}
```

### OAuthApp Interface
```ts
interface OAuthApp {
  id: string;
  clientId: string;
  name: string;
  redirectUris: string[];
  allowedScopes: string[];
  isActive: boolean;
  createdAt: string;
}
```

### Table Columns
App Name | Client ID (mono + copy button) | Redirect URIs (up to 2 badges + overflow) | Created | Actions (rotate secret, delete)

### Notable Details
- **Credentials shown once**: After registration, both `client_id` and `client_secret` appear in a green banner with individual copy buttons. Dismissing the banner removes them permanently.
- **Redirect URIs input**: A chip-like pattern. Type a URI, press Enter to add. Click X on a chip to remove. Uses local `redirectUris = signal<string[]>([])`.
- **Rotate Secret**: Uses `ConfirmationService` with warning that the old secret stops working immediately. On success, only the new `client_secret` is shown (clientId is set to empty string in the banner since it is already known).
- Delete also requires confirmation dialog.

---

## 4. Documentation

**Path**: `features/docs/`
**Purpose**: SDK installation guides, code examples, and Swagger API reference link.

### API Endpoints
| Method | Endpoint | Used For |
|--------|----------|----------|
| GET | `/api/v1/docs/sdks` | List available SDKs |
| GET | `/api/v1/docs/examples/:type` | Get code example by type |

### Store State Shape
```ts
interface DocsState {
  sdks: SdkInfo[];
  examples: CodeExample[];
  loading: boolean;
}
```

### SdkInfo Interface
```ts
interface SdkInfo {
  language: string;            // 'node' | 'go'
  name: string;
  version: string;
  packageManager: string;
  installCommand: string;      // e.g. "npm install @wave-connect/sso-sdk"
  docsUrl: string;
}
```

### CodeExample Interface
```ts
interface CodeExample {
  type: string;                // e.g. 'verify-token', 'check-permission'
  title: string;
  description: string;
  examples: Record<string, string>;  // key = language, value = code snippet
}
```

### Page Sections
1. **SDK Cards** (grid of 2):
   - Dynamic: Rendered from `store.sdks()` if the API returns data.
   - Static fallback: If the array is empty, two hardcoded cards appear for Node.js (`npm install @wave-connect/sso-sdk`) and Go (`go get github.com/wave-connect/sso-sdk-go`).
   - Each card has install command with copy-to-clipboard button.

2. **Code Examples**: Loaded from `verify-token` and `check-permission` example types. Rendered as code blocks per language.

3. **API Reference**: Static card linking to `/api/docs` (Swagger UI) in a new tab.

### Notable Details
- SDK loading and example loading are in separate try/catch blocks so the page degrades gracefully if examples fail.
- No PrimeNG components -- pure Tailwind + Heroicons.
- `objectEntries()` helper method converts `Record<string, string>` to `[string, string][]` for template iteration.

---

## 5. SCIM Tokens

**Path**: `features/scim/`
**Purpose**: Generate and revoke SCIM 2.0 bearer tokens; view sync log.

### API Endpoints
| Method | Endpoint | Used For |
|--------|----------|----------|
| GET | `/api/v1/scim-tokens` | List tokens |
| POST | `/api/v1/scim-tokens` | Generate token (returns `token` once) |
| DELETE | `/api/v1/scim-tokens/:id` | Revoke token |
| GET | `/api/v1/scim-tokens/sync-logs?page=N&pageSize=20` | List sync events |

### Store State Shape
```ts
interface ScimState {
  tokens: ScimToken[];
  syncLogs: ScimSyncLog[];
  loading: boolean;
  newToken: string | null;      // shown once after generation
}
```

### ScimToken Interface
```ts
interface ScimToken {
  id: string;
  tokenPrefix: string;
  label?: string;
  isActive: boolean;
  lastUsedAt?: string;
  expiresAt?: string;
  createdAt: string;
}
```

### ScimSyncLog Interface
```ts
interface ScimSyncLog {
  id: string;
  operation: string;
  resourceType: string;
  resourceId: string;
  status: string;              // 'success' | 'failure'
  errorMessage?: string;
  createdAt: string;
}
```

### Page Sections
1. **Token banner** -- Green banner with copy button, appears after generation, dismissed via `dismissToken()`.
2. **Tokens table** -- Prefix (mono) | Label | Created | Last Used | Status badge | Actions (revoke if active).
3. **Sync Log table** -- Timestamp | Operation | Resource (type + ID) | Status badge.

### Notable Details
- Nearly identical implementation to the Admin Console SCIM page (`features/scim/` in admin-console). The difference: the Developer Portal version calls `devPortalApiUrl` while the Admin Console version calls `directoryServiceUrl`.
- `loadData()` fetches tokens and sync logs in parallel.
- Both generate and revoke use `ConfirmationService` dialogs.
- Token is only shown once and cannot be retrieved later.

---

## Shared Patterns Across Developer Portal

### Environment Config
All services use `environment.devPortalApiUrl` (resolves to `http://localhost:3500` in dev).

### Copy-to-Clipboard
Every page with secrets/keys/credentials implements the same helper:
```ts
copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
}
```

### One-Time Secrets Pattern
API Keys, OAuth Apps, and SCIM Tokens all follow the same pattern:
1. POST returns the secret/key/token in the response body.
2. Store saves it to a `newKey` / `newCredentials` / `newToken` field.
3. A green banner renders in the template with copy button.
4. A dismiss button sets the field back to `null`.
5. The secret is never stored or retrievable after dismissal.

### Authentication
The Developer Portal uses OAuth2 PKCE authentication (see Phase 2 KT). The `accessToken` is stored in `sessionStorage` and attached to requests via an HTTP interceptor.
