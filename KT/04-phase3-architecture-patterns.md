# Phase 3: Architecture Patterns

This document covers the repeating architecture patterns used across all features in both the admin-console and developer-portal applications.

---

## 1. Feature File Structure

Every feature follows a consistent three-file pattern:

```
apps/<app>/src/app/features/<feature>/
  <feature>.component.ts    -- UI component (template + logic)
  <feature>.store.ts        -- @ngrx/signals SignalStore (state management)
  <feature>.service.ts      -- HttpClient service (API calls)
```

For example, the Users feature:

```
apps/admin-console/src/app/features/users/
  users.component.ts
  users.store.ts
  users.service.ts
```

The same pattern is used for: `dashboard`, `users`, `groups`, `policies`, `webhooks`, `audit`, `scim`, `api-keys`, `oauth-apps`, `docs`.

---

## 2. SignalStore Pattern

All stores use `@ngrx/signals` `signalStore()` with a standard composition:

```typescript
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
          // Reload the list
          const res = await firstValueFrom(svc.list(store.page(), store.pageSize()));
          patchState(store, { users: res.data ?? [], total: res.total ?? 0 });
        } catch {
          msg.add({ severity: 'error', summary: 'Error', detail: 'Failed to create user' });
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
      store.loadUsers();  // Auto-load on init
    },
  }),
);
```

### Key conventions

| Concept | Pattern |
|---------|---------|
| State shape | Define an `interface XxxState` with all state fields |
| Initial state | Pass to `withState<XxxState>({ ... })` |
| Dependencies | Inject services inside `withMethods()` using `inject()` |
| Async operations | Use `async`/`await` with `firstValueFrom()` to convert Observable to Promise |
| State updates | Always use `patchState(store, { ... })` -- never mutate directly |
| Error handling | `try/catch` with toast notification on failure |
| Auto-loading | `withHooks({ onInit })` triggers initial data fetch |
| Dialog state | `dialogVisible: boolean` in state, with `showDialog()`/`hideDialog()` methods |

### Providing the store

Stores are provided at the **component level**, not root:

```typescript
@Component({
  providers: [UsersStore],  // <-- scoped to this component
})
export class UsersComponent {
  readonly store = inject(UsersStore);
}
```

This ensures the store is created when the component mounts and destroyed when it unmounts.

---

## 3. Service Pattern

Services are `@Injectable({ providedIn: 'root' })` and use Angular's `HttpClient`:

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

export interface User {
  id: string;
  email: string;
  displayName?: string;
  status: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface UsersResponse {
  data: User[];
  total: number;
  page: number;
  pageSize: number;
}

@Injectable({ providedIn: 'root' })
export class UsersService {
  private http = inject(HttpClient);
  private get baseUrl() {
    const tid = sessionStorage.getItem('tenantId') ?? '';
    return `${environment.adminApiUrl}/api/v1/tenants/${tid}/users`;
  }

  list(page = 1, pageSize = 20) {
    return this.http.get<UsersResponse>(this.baseUrl, { params: { page, pageSize } });
  }

  create(dto: CreateUserDto) {
    return this.http.post<User>(this.baseUrl, dto);
  }

  update(id: string, dto: Partial<User> & { version: number }) {
    return this.http.patch<User>(`${this.baseUrl}/${id}`, dto);
  }

  delete(id: string) {
    return this.http.delete<User>(`${this.baseUrl}/${id}`);
  }
}
```

### Key conventions

- **Base URL** comes from `environment.adminApiUrl` (admin-console) or `environment.devPortalApiUrl` (developer-portal).
- **Tenant ID** is read from `sessionStorage` and included in the URL path for admin-console services.
- **Return type** is always `Observable<T>` -- the store converts to Promise via `firstValueFrom()`.
- **Auth headers** are attached automatically by interceptors (see Section 4), so services never set `Authorization` manually.
- **Interfaces** for request/response types are defined and exported from the service file alongside the class.

---

## 4. HTTP Interceptors

### Admin Console (2 interceptors)

Located in `apps/admin-console/src/app/app.config.ts`:

```typescript
const bearerInterceptor: HttpInterceptorFn = (req, next) => {
  const token = sessionStorage.getItem('accessToken');
  if (token) {
    return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
  }
  return next(req);
};

const tenantInterceptor: HttpInterceptorFn = (req, next) => {
  const tenantId = sessionStorage.getItem('tenantId');
  if (tenantId) {
    return next(req.clone({ setHeaders: { 'X-Tenant-ID': tenantId } }));
  }
  return next(req);
};

// Registered as:
provideHttpClient(withInterceptors([bearerInterceptor, tenantInterceptor]))
```

### Developer Portal (1 interceptor)

```typescript
const bearerInterceptor: HttpInterceptorFn = (req, next) => {
  const token = sessionStorage.getItem('accessToken');
  if (token) {
    return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
  }
  return next(req);
};

// Registered as:
provideHttpClient(withInterceptors([bearerInterceptor]))
```

The developer portal does not need `tenantInterceptor` because developer API endpoints do not require a tenant context.

---

## 5. OAuth2 PKCE Authentication Flow

Both apps use an identical OAuth2 PKCE flow to authenticate with the SSO service.

### 5.1 Auth Guard

**File:** `apps/<app>/src/app/guards/auth.guard.ts`

```typescript
export const authGuard: CanActivateFn = async () => {
  // 1. If token exists, allow navigation
  const token = sessionStorage.getItem('accessToken');
  if (token) return true;

  // 2. Generate PKCE parameters
  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  const state = generateState();

  // 3. Store for callback
  sessionStorage.setItem('pkce_verifier', verifier);
  sessionStorage.setItem('oauth_state', state);

  // 4. Redirect to SSO authorize endpoint
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: environment.oauthClientId,
    redirect_uri: environment.oauthRedirectUri,
    scope: 'openid profile email',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  window.location.href = `${environment.ssoServiceUrl}/oauth2/authorize?${params}`;
  return false;
};
```

### 5.2 Callback Component

**File:** `apps/<app>/src/app/callback/callback.component.ts`

The callback component handles the redirect back from the SSO service:

1. Extracts `code` and `state` from URL query params.
2. Validates `state` matches what was stored (CSRF protection).
3. Retrieves the `pkce_verifier` from sessionStorage.
4. POSTs to `ssoServiceUrl/oauth2/token` with the authorization code and verifier.
5. Stores `accessToken`, `refreshToken`, `idToken`, and `tenantId` in sessionStorage.
6. Cleans up PKCE state and navigates to `/dashboard`.

### 5.3 Environment config

```typescript
// apps/admin-console/src/app/environments/environment.ts
export const environment = {
  production: false,
  adminApiUrl: 'http://localhost:3100',
  ssoServiceUrl: 'http://localhost:8083',
  oauthClientId: 'admin-console',
  oauthRedirectUri: 'http://localhost:4301/callback',
  // ...
};
```

### 5.4 Flow diagram

```
Browser                    SSO Service                 Admin API
  |                            |                          |
  |-- authGuard fires -------->|                          |
  |   (no token in session)    |                          |
  |                            |                          |
  |-- redirect to /oauth2/authorize (PKCE params) ------->|
  |                            |                          |
  |<-- redirect to /callback?code=xxx&state=yyy ---------|
  |                            |                          |
  |-- POST /oauth2/token (code + verifier) -------------->|
  |                            |                          |
  |<-- { access_token, refresh_token, tenant_id } -------|
  |                            |                          |
  |-- store tokens in sessionStorage                      |
  |-- navigate to /dashboard                              |
  |                            |                          |
  |-- GET /api/v1/... (Authorization: Bearer xxx) ------->|
```

---

## 6. Angular Signal Forms

The login-portal uses Angular 21's signal-based forms from `@angular/forms/signals`.

### 6.1 Setup

```typescript
import { form, FormField, submit, required, email, minLength } from '@angular/forms/signals';
```

### 6.2 Creating a form

```typescript
// The model is a plain signal holding the form data
readonly loginModel = signal({
  email: '',
  password: '',
});

// form() wraps the signal with validation
readonly loginForm = form(this.loginModel, (s) => {
  required(s.email, { message: 'Please enter a valid email address.' });
  email(s.email, { message: 'Please enter a valid email address.' });
  required(s.password, { message: 'Password must be at least 8 characters.' });
  minLength(s.password, 8, { message: 'Password must be at least 8 characters.' });
});
```

### 6.3 Template binding

```html
<input type="email" [formField]="loginForm.email" />

@if (loginForm.email().touched() && loginForm.email().errors().length) {
  <p class="mt-1 text-xs text-destructive">
    {{ loginForm.email().errors()[0].message }}
  </p>
}
```

### 6.4 Submission

```typescript
onSubmit(): void {
  submit(this.loginForm, async () => {
    const { email, password } = this.loginModel();
    await this.store.login(email, password);
  });
}
```

The `submit()` function runs validation first. The callback only executes if the form is valid.

### 6.5 Available validators

| Validator | Import | Usage |
|-----------|--------|-------|
| `required` | `@angular/forms/signals` | `required(s.field, { message: '...' })` |
| `email` | `@angular/forms/signals` | `email(s.field, { message: '...' })` |
| `minLength` | `@angular/forms/signals` | `minLength(s.field, 8, { message: '...' })` |

---

## 7. PrimeNG Components Used

The following PrimeNG components are used across features:

| Component | Import | Usage |
|-----------|--------|-------|
| `p-table` | `import { Table } from 'primeng/table'` | Data tables with lazy loading and sorting |
| `p-dialog` | `import { Dialog } from 'primeng/dialog'` | Modal dialogs for create/edit forms |
| `p-datePicker` | `import { DatePicker } from 'primeng/datepicker'` | Date range filters |
| `p-multiSelect` | `import { MultiSelect } from 'primeng/multiselect'` | Multi-value filter dropdowns |
| `p-toggleSwitch` | `import { ToggleSwitch } from 'primeng/toggleswitch'` | Boolean toggles (active/inactive) |
| `p-chart` | `import { Chart } from 'primeng/chart'` | Dashboard charts (line, bar, doughnut) |
| `p-tag` | `import { Tag } from 'primeng/tag'` | Status tags |
| `p-toast` | `import { Toast } from 'primeng/toast'` | Toast notifications |
| `p-confirmDialog` | `import { ConfirmDialog } from 'primeng/confirmdialog'` | Confirmation modals |
| `p-card` | `import { Card } from 'primeng/card'` | Card containers |
| `p-inputNumber` | `import { InputNumber } from 'primeng/inputnumber'` | Numeric inputs |
| `p-chips` | `import { InputChips } from 'primeng/inputchips'` | Tag-style multi-value inputs |
| `p-select` | `import { Select } from 'primeng/select'` | Single-value dropdowns |

---

## 8. Toast Notifications

Toast notifications use PrimeNG's `MessageService`, which is provided at the layout level.

### 8.1 Injecting the service

```typescript
import { MessageService } from 'primeng/api';

// In a store:
const msg = inject(MessageService);

// In a component:
private messageService = inject(MessageService);
```

### 8.2 Showing a toast

```typescript
// Success
msg.add({ severity: 'success', summary: 'Success', detail: 'User created successfully' });

// Error
msg.add({ severity: 'error', summary: 'Error', detail: 'Failed to create user' });

// Warning
msg.add({ severity: 'warn', summary: 'Warning', detail: 'This action cannot be undone' });

// Info
msg.add({ severity: 'info', summary: 'Info', detail: 'Processing your request...' });
```

The toast appears at `top-right` as configured in the layout's `<p-toast position="top-right" />`.

---

## 9. Confirm Dialogs

Confirm dialogs use PrimeNG's `ConfirmationService`, also provided at the layout level.

### 9.1 Usage

```typescript
import { ConfirmationService } from 'primeng/api';

private confirmSvc = inject(ConfirmationService);

confirmDelete(user: User) {
  this.confirmSvc.confirm({
    message: `Are you sure you want to remove ${user.email}?`,
    header: 'Confirm Removal',
    acceptButtonStyleClass: 'bg-destructive text-destructive-foreground',
    accept: () => this.store.deleteUser(user),
  });
}
```

The dialog renders in the layout's `<p-confirmDialog />` element. The pass-through config in `snowPassThrough.confirmdialog` controls its appearance.

---

## 10. Copy to Clipboard

For copying API keys, tokens, or other values:

```typescript
async copyToClipboard(value: string) {
  await navigator.clipboard.writeText(value);
  this.messageService.add({
    severity: 'success',
    summary: 'Copied',
    detail: 'Value copied to clipboard',
  });
}
```

Always pair clipboard operations with a toast notification so the user knows it worked.

---

## 11. Quick Reference: Adding a New Feature

Follow these steps to add a new feature (e.g., "Roles"):

1. **Create the files:**
   ```
   apps/admin-console/src/app/features/roles/
     roles.component.ts
     roles.store.ts
     roles.service.ts
   ```

2. **Service** (`roles.service.ts`):
   - `@Injectable({ providedIn: 'root' })`
   - Inject `HttpClient`, use `environment.adminApiUrl`
   - Define interfaces for the API response types
   - Export CRUD methods returning `Observable<T>`

3. **Store** (`roles.store.ts`):
   - Define `RolesState` interface
   - Use `signalStore(withState, withMethods, withHooks)`
   - Inject the service and `MessageService` inside `withMethods`
   - Add CRUD methods with `patchState` + `firstValueFrom` + toast notifications
   - Auto-load in `onInit` hook

4. **Component** (`roles.component.ts`):
   - `providers: [RolesStore]` at the component level
   - Inject the store: `readonly store = inject(RolesStore)`
   - Inject `ConfirmationService` for delete confirmations
   - Use `@for` to iterate data, `@if` for conditional rendering
   - Use `<p-dialog>` for create/edit forms
   - Use Tailwind classes from the Snow UI design system

5. **Route** (`app.routes.ts`):
   ```typescript
   { path: 'roles', loadComponent: () => import('./features/roles/roles.component').then(m => m.RolesComponent) }
   ```

6. **Navigation** (`layout.component.ts`):
   ```typescript
   { path: 'roles', label: 'Roles', icon: 'heroShieldCheck' }
   ```

7. **Icons**: If using a new icon, add it to `provideIcons()` in `app.config.ts`.
