# 08 - Backend API Reference

This document covers every HTTP endpoint exposed by the two NestJS services in the WaveConnect SSO platform. Use it as a quick-reference when integrating, testing, or debugging.

---

## Conventions

### Authentication

All endpoints (except the Documentation endpoints on the Developer Portal API) require a Bearer token in the `Authorization` header:

```
Authorization: Bearer <PASETO_TOKEN>
```

### Tenant Scoping

Admin API endpoints are scoped to a tenant via the URL path (`/tenants/:tenantId/...`). The `tenantId` parameter is always a UUID and is validated with `ParseUUIDPipe`.

### Pagination

Every list endpoint follows the same pattern:

| Query Param | Type   | Default | Description          |
|-------------|--------|---------|----------------------|
| `page`      | number | 1       | Page number (1-based)|
| `pageSize`  | number | 20      | Items per page       |

Response shape:

```json
{
  "data": [ ... ],
  "total": 142,
  "page": 1,
  "pageSize": 20
}
```

### Optimistic Locking

All `PATCH` (update) endpoints require a `version` field in the request body. The server compares this against the current row version. If they do not match, the server returns `409 Conflict` indicating the resource was modified concurrently. Re-fetch the resource, get the latest `version`, and retry.

### Soft Deletes

`DELETE` endpoints perform soft deletes (set a `deletedAt` timestamp). The record is excluded from list queries but remains in the database for audit purposes.

### Validation

Both services use NestJS `ValidationPipe` with `whitelist: true` and `forbidNonWhitelisted: true`. Malformed or unknown fields return `400 Bad Request`.

### Swagger / OpenAPI

Both services expose interactive Swagger docs:

- Admin API: `http://localhost:3100/docs`
- Developer Portal API: `http://localhost:3500/docs`

---

## Admin API (NestJS -- port 3100)

Base URL: `http://localhost:3100`

### 1. Tenants

**Controller path:** `api/v1/tenants`

| Method   | Path                  | Description                                      | Notes                                     |
|----------|-----------------------|--------------------------------------------------|-------------------------------------------|
| `POST`   | `/api/v1/tenants`     | Create a new tenant                              | Body: `{ name, slug, plan }`              |
| `GET`    | `/api/v1/tenants`     | List all tenants (paginated)                     | Query: `page`, `pageSize`                 |
| `GET`    | `/api/v1/tenants/:id` | Get a single tenant by UUID                      |                                           |
| `PATCH`  | `/api/v1/tenants/:id` | Update a tenant                                  | Body must include `version` (optimistic)  |
| `DELETE` | `/api/v1/tenants/:id` | Soft-delete a tenant                             |                                           |

**Example -- Create a tenant:**

```bash
curl -X POST http://localhost:3100/api/v1/tenants \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "Acme Corp",
    "slug": "acme-corp",
    "plan": "enterprise"
  }'
```

**Example -- Update with optimistic locking:**

```bash
curl -X PATCH http://localhost:3100/api/v1/tenants/$TENANT_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "version": 3,
    "name": "Acme Corporation"
  }'
```

---

### 2. Users

**Controller path:** `api/v1/tenants/:tenantId/users`

| Method   | Path                                          | Description              | Notes                                                  |
|----------|-----------------------------------------------|--------------------------|--------------------------------------------------------|
| `POST`   | `/api/v1/tenants/:tenantId/users`             | Create a user            | Body: `{ email, password?, displayName?, firstName?, lastName?, phoneNumber?, locale?, timezone?, status?, emailVerified? }` |
| `GET`    | `/api/v1/tenants/:tenantId/users`             | List users (paginated)   | Query: `page`, `pageSize`                              |
| `GET`    | `/api/v1/tenants/:tenantId/users/:id`         | Get a user by UUID       |                                                        |
| `PATCH`  | `/api/v1/tenants/:tenantId/users/:id`         | Update a user            | Body must include `version`                            |
| `DELETE` | `/api/v1/tenants/:tenantId/users/:id`         | Soft-delete a user       |                                                        |

**User status values:** `active`, `inactive`, `suspended`, `pending` (default: `pending`)

**Example -- Create a user:**

```bash
curl -X POST http://localhost:3100/api/v1/tenants/$TENANT_ID/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "email": "jane@acme.com",
    "displayName": "Jane Doe",
    "password": "SecureP@ss123",
    "status": "active"
  }'
```

---

### 3. Groups

**Controller path:** `api/v1/tenants/:tenantId/groups`

| Method   | Path                                                           | Description                  | Notes                              |
|----------|----------------------------------------------------------------|------------------------------|------------------------------------|
| `POST`   | `/api/v1/tenants/:tenantId/groups`                             | Create a group               | Body: `{ name, slug, description? }` |
| `GET`    | `/api/v1/tenants/:tenantId/groups`                             | List groups (paginated)      | Query: `page`, `pageSize`          |
| `GET`    | `/api/v1/tenants/:tenantId/groups/:id`                         | Get group with members       | Includes members and child groups  |
| `DELETE` | `/api/v1/tenants/:tenantId/groups/:id`                         | Soft-delete a group          |                                    |
| `POST`   | `/api/v1/tenants/:tenantId/groups/:id/members`                 | Add a member to a group      | Body: `{ userId, role? }`          |
| `DELETE` | `/api/v1/tenants/:tenantId/groups/:id/members/:userId`         | Remove a member from a group |                                    |
| `POST`   | `/api/v1/tenants/:tenantId/groups/:id/children`                | Nest a child group           | Body: `{ childGroupId }`           |
| `DELETE` | `/api/v1/tenants/:tenantId/groups/:id/children/:childGroupId`  | Remove group nesting         |                                    |

**Example -- Create a group and add a member:**

```bash
# Create group
curl -X POST http://localhost:3100/api/v1/tenants/$TENANT_ID/groups \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{ "name": "Engineering", "slug": "engineering" }'

# Add member
curl -X POST http://localhost:3100/api/v1/tenants/$TENANT_ID/groups/$GROUP_ID/members \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{ "userId": "'$USER_ID'", "role": "admin" }'
```

---

### 4. Security Policies

**Controller path:** `api/v1/tenants/:tenantId/settings`

| Method  | Path                                             | Description                                  | Notes                       |
|---------|--------------------------------------------------|----------------------------------------------|-----------------------------|
| `GET`   | `/api/v1/tenants/:tenantId/settings/policies`    | Get the tenant security policy               |                             |
| `PATCH` | `/api/v1/tenants/:tenantId/settings/policies`    | Update the tenant security policy            | Body must include `version` |

**Policy fields (all optional except `version`):**

| Field                    | Type       | Constraints    | Description                         |
|--------------------------|------------|----------------|-------------------------------------|
| `version`                | integer    | required, >= 1 | Optimistic lock version             |
| `passwordMinLength`      | integer    | 8 -- 128       | Minimum password length             |
| `passwordRequireUpper`   | boolean    |                | Require uppercase letters           |
| `passwordRequireLower`   | boolean    |                | Require lowercase letters           |
| `passwordRequireNumber`  | boolean    |                | Require numbers                     |
| `passwordRequireSymbol`  | boolean    |                | Require symbols                     |
| `passwordRequireMfa`     | boolean    |                | Require MFA for all users           |
| `allowedMfaMethods`      | string[]   |                | e.g. `["totp", "webauthn"]`         |
| `passwordHistoryCount`   | integer    | 0 -- 24        | Prevent password reuse (last N)     |
| `sessionMaxAgeHours`     | integer    | 1 -- 720       | Max session age in hours            |
| `idleTimeoutMinutes`     | integer    | 5 -- 1440      | Idle timeout in minutes             |
| `maxSessionsPerUser`     | integer    | 1 -- 100       | Max concurrent sessions per user    |
| `lockoutThreshold`       | integer    | 3 -- 20        | Failed login attempts before lock   |
| `lockoutDurationMin`     | integer    | 1 -- 1440      | Lockout duration in minutes         |
| `ipAllowlist`            | string[]   |                | CIDR ranges, e.g. `["10.0.0.0/8"]` |
| `allowedEmailDomains`    | string[]   |                | e.g. `["acme.com"]`                 |
| `requireSso`             | boolean    |                | Require SSO for login               |

**Example -- Enforce strong passwords:**

```bash
curl -X PATCH http://localhost:3100/api/v1/tenants/$TENANT_ID/settings/policies \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "version": 1,
    "passwordMinLength": 12,
    "passwordRequireUpper": true,
    "passwordRequireLower": true,
    "passwordRequireNumber": true,
    "passwordRequireSymbol": true,
    "lockoutThreshold": 5,
    "lockoutDurationMin": 15
  }'
```

---

### 5. Memberships

**Controller path:** `api/v1/tenants/:tenantId/memberships`

| Method   | Path                                                    | Description                | Notes                                                         |
|----------|---------------------------------------------------------|----------------------------|---------------------------------------------------------------|
| `POST`   | `/api/v1/tenants/:tenantId/memberships`                 | Invite a member            | Body: `{ email, role? }` -- role defaults to `member`         |
| `GET`    | `/api/v1/tenants/:tenantId/memberships`                 | List memberships (paginated)|Query: `page`, `pageSize`                                     |
| `GET`    | `/api/v1/tenants/:tenantId/memberships/:id`             | Get a membership by UUID   |                                                               |
| `PATCH`  | `/api/v1/tenants/:tenantId/memberships/:id/role`        | Update member role         | Body: `{ role, version }` -- writes to authz outbox           |
| `DELETE` | `/api/v1/tenants/:tenantId/memberships/:id`             | Remove a member            |                                                               |

**Membership roles:** `owner`, `admin`, `member`, `billing_manager`, `readonly`

**Example -- Invite an admin:**

```bash
curl -X POST http://localhost:3100/api/v1/tenants/$TENANT_ID/memberships \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{ "email": "alice@acme.com", "role": "admin" }'
```

---

### 6. Identity Providers

**Controller path:** `api/v1/tenants/:tenantId/identity-providers`

| Method   | Path                                                            | Description                    | Notes                               |
|----------|-----------------------------------------------------------------|--------------------------------|--------------------------------------|
| `POST`   | `/api/v1/tenants/:tenantId/identity-providers/saml`             | Create a SAML IdP              | Body: SAML metadata fields           |
| `POST`   | `/api/v1/tenants/:tenantId/identity-providers/oidc`             | Create an OIDC IdP             | Body: OIDC configuration fields      |
| `GET`    | `/api/v1/tenants/:tenantId/identity-providers`                  | List identity providers        | Query: `page`, `pageSize`            |
| `GET`    | `/api/v1/tenants/:tenantId/identity-providers/:id`              | Get an IdP by UUID             |                                      |
| `PATCH`  | `/api/v1/tenants/:tenantId/identity-providers/:id`              | Update an IdP                  | Body must include `version`          |
| `DELETE` | `/api/v1/tenants/:tenantId/identity-providers/:id`              | Soft-delete an IdP             |                                      |

**Example -- Create an OIDC identity provider:**

```bash
curl -X POST http://localhost:3100/api/v1/tenants/$TENANT_ID/identity-providers/oidc \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "Google Workspace",
    "issuer": "https://accounts.google.com",
    "clientId": "your-client-id",
    "clientSecret": "your-client-secret",
    "discoveryUrl": "https://accounts.google.com/.well-known/openid-configuration"
  }'
```

---

## Developer Portal API (NestJS -- port 3500)

Base URL: `http://localhost:3500`

All endpoints use Bearer token authentication. The tenant is currently derived from the token (placeholder in Phase 4; will be extracted from the PASETO token via a guard).

### 1. API Keys

**Controller path:** `api/v1/api-keys`

| Method   | Path                           | Description                          | Notes                                              |
|----------|--------------------------------|--------------------------------------|----------------------------------------------------|
| `POST`   | `/api/v1/api-keys`             | Create a new API key                 | Returns the **full key once only**. Store it.       |
| `GET`    | `/api/v1/api-keys`             | List API keys (paginated)            | Query: `page`, `pageSize`                           |
| `GET`    | `/api/v1/api-keys/:id`         | Get API key details                  | Key hash is never exposed                           |
| `DELETE` | `/api/v1/api-keys/:id`         | Revoke an API key                    | Returns `204 No Content`                            |
| `GET`    | `/api/v1/api-keys/:id/usage`   | Get usage metrics for a key          | Query: `days` (default 30)                          |

**Create API key body:**

```json
{
  "name": "CI/CD Pipeline Key",
  "scopes": ["read:users", "write:users"],
  "rate_limit_per_min": 120,
  "expires_at": "2026-12-31T23:59:59Z"
}
```

**Example -- Create and capture the key:**

```bash
curl -X POST http://localhost:3500/api/v1/api-keys \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{ "name": "My API Key", "scopes": ["read:users"] }'

# Response includes `key` field -- save it immediately.
# It will never be returned again.
```

---

### 2. OAuth Applications

**Controller path:** `api/v1/oauth-apps`

| Method   | Path                                  | Description                          | Notes                                                  |
|----------|---------------------------------------|--------------------------------------|--------------------------------------------------------|
| `POST`   | `/api/v1/oauth-apps`                  | Register a new OAuth application     | Returns `client_id` + `client_secret` -- **shown once**|
| `GET`    | `/api/v1/oauth-apps`                  | List OAuth applications (paginated)  | Query: `page`, `pageSize`                              |
| `POST`   | `/api/v1/oauth-apps/:id/rotate-secret`| Rotate the client secret             | Returns the new secret -- **shown once**               |
| `DELETE` | `/api/v1/oauth-apps/:id`              | Delete an OAuth application          | Returns `204 No Content`                               |

**Create OAuth app body:**

```json
{
  "name": "My SPA",
  "redirect_uris": ["https://app.example.com/callback"],
  "allowed_scopes": ["openid", "profile", "email"]
}
```

**Example -- Register an app:**

```bash
curl -X POST http://localhost:3500/api/v1/oauth-apps \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "My SPA",
    "redirect_uris": ["http://localhost:3000/callback"],
    "allowed_scopes": ["openid", "profile"]
  }'
```

---

### 3. SCIM Tokens

**Controller path:** `api/v1/scim-tokens`

| Method   | Path                          | Description                        | Notes                                         |
|----------|-------------------------------|------------------------------------|-----------------------------------------------|
| `POST`   | `/api/v1/scim-tokens`         | Generate a new SCIM token          | Returns the **full token once only**           |
| `GET`    | `/api/v1/scim-tokens`         | List tokens (prefix only)          | Full token is never shown again                |
| `DELETE` | `/api/v1/scim-tokens/:id`     | Revoke a SCIM token                | Returns `204 No Content`                       |
| `GET`    | `/api/v1/scim-tokens/sync-logs`| View SCIM sync operation history  | Query: `page`, `pageSize` (default 50)         |

**Example -- Generate a SCIM token:**

```bash
curl -X POST http://localhost:3500/api/v1/scim-tokens \
  -H "Authorization: Bearer $TOKEN"

# Response:
# { "id": "...", "token": "abc123...", "prefix": "abc12345", "message": "Token shown only once. Store it securely." }
```

---

### 4. Documentation

**Controller path:** `api/v1/docs`

These endpoints are public (no authentication required).

| Method | Path                          | Description                              | Notes                         |
|--------|-------------------------------|------------------------------------------|-------------------------------|
| `GET`  | `/api/v1/docs/sdks`           | List available SDKs (Node.js, Go)        |                               |
| `GET`  | `/api/v1/docs/sdks/:language` | Get SDK details for a specific language  | `:language` = `node` or `go`  |
| `GET`  | `/api/v1/docs/examples/:type` | Get code examples                        | `:type` = `verify-token` or `check-permission` |

**Example -- Get Node.js SDK docs:**

```bash
curl http://localhost:3500/api/v1/docs/sdks/node
```

---

## HTTP Status Codes Reference

| Code  | Meaning                | When                                                  |
|-------|------------------------|-------------------------------------------------------|
| `200` | OK                     | Successful GET, PATCH, or soft-DELETE                  |
| `201` | Created                | Successful POST (resource created)                     |
| `204` | No Content             | Successful DELETE (API keys, OAuth apps, SCIM tokens)  |
| `400` | Bad Request            | Validation failure (missing/invalid fields)            |
| `401` | Unauthorized           | Missing or invalid Bearer token                        |
| `403` | Forbidden              | Insufficient permissions for the operation             |
| `404` | Not Found              | Resource does not exist or is soft-deleted              |
| `409` | Conflict               | Optimistic locking version mismatch or duplicate entry |

---

## Error Response Shape

All error responses follow a consistent shape:

```json
{
  "statusCode": 409,
  "message": "Version conflict -- tenant was modified concurrently",
  "error": "Conflict"
}
```

---

## Quick Port Reference

| Service               | Port  | Type      |
|-----------------------|-------|-----------|
| Admin API             | 3100  | NestJS    |
| Directory Service     | 3200  | NestJS    |
| Webhook Service       | 3300  | NestJS    |
| Audit Service         | 3400  | NestJS    |
| Developer Portal API  | 3500  | NestJS    |
| Identity Service      | 3000  | Go        |
| AuthZ Service         | 8082  | Go (HTTP) |
| SSO Service           | 8083  | Go        |
| Login Portal          | 4200  | Angular   |
| Admin Console         | 4300  | Angular   |
| Developer Portal      | 4400  | Angular   |
