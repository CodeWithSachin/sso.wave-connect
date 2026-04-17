# Phase 6 -- Build Verification, Debugging, and Common Issues

> This document covers how to build, serve, and troubleshoot the WaveConnect SSO platform.
> Read this first when you join the team.

---

## Building

### Build a single app

```bash
pnpm nx build admin-console
pnpm nx build developer-portal
pnpm nx build login-portal
pnpm nx build admin-api
pnpm nx build developer-portal-api
```

### Build everything

```bash
pnpm nx run-many --target=build --all
# or use the convenience script:
pnpm build:all
```

### Budget warnings

The Angular frontends may emit initial bundle size warnings around 500-517 kB. These are non-blocking warnings from the Angular build budget configuration. They do not fail the build and are expected at this stage. The apps still work correctly.

---

## Serving

### All 11 services at once

```bash
pnpm serve:all
```

This command:
1. Exports all variables from the root `.env` file into the shell environment.
2. Runs `nx run-many --target=serve` for all 11 projects in parallel.

**Projects started**: admin-console, developer-portal, login-portal, admin-api, developer-portal-api, audit-service, webhook-service, directory-service, sso-service, identity-service, authz-service.

### Frontend only (3 Angular apps)

```bash
pnpm serve:frontend
```

Starts: login-portal (:4300), admin-console (:4301), developer-portal (:4302).

Does NOT export `.env` vars (frontends do not need them -- they use `environment.ts` for API URLs).

### Backend only (8 NestJS/Go services)

```bash
pnpm serve:backend
```

Starts: admin-api (:3100), developer-portal-api (:3500), audit-service (:3200), webhook-service (:3400), directory-service (:3300), sso-service (:3000), identity-service, authz-service.

Exports `.env` vars first (backends need `DATABASE_URL`, etc.).

---

## Port Map

| Service | Port | Type |
|---------|------|------|
| sso-service | 3000 | NestJS |
| admin-api | 3100 | NestJS |
| audit-service | 3200 | NestJS |
| directory-service | 3300 | NestJS |
| webhook-service | 3400 | NestJS |
| developer-portal-api | 3500 | NestJS |
| login-portal | 4300 | Angular |
| admin-console | 4301 | Angular |
| developer-portal | 4302 | Angular |
| authz-service | 8082 | Go |
| identity-service | 8083 | Go |

---

## Verifying All Services Are Running

Run this to check which services are listening:

```bash
lsof -i -P -n | grep LISTEN | grep -E ":(3[0-5]00|4[2-4]00|808[23])"
```

You should see entries for all ports listed in the port map above. If a port is missing, that service failed to start -- check its terminal output or logs.

---

## Common Issues

### 1. Port already in use

**Symptom**: Service fails to start with `EADDRINUSE` or similar error.

**Fix**: Kill the stale process occupying the port.

```bash
# Kill whatever is on port 3100 (for example)
lsof -ti :3100 | xargs kill

# Or kill multiple at once
lsof -ti :3100 -ti :3200 -ti :3500 | xargs kill
```

Then restart the service.

### 2. NestJS 500 Internal Server Error

**Symptom**: API calls return HTTP 500 with a generic error message.

**Likely cause**: Database column mismatch between Prisma raw queries and the actual PostgreSQL schema. This happens when:
- A migration was run but the NestJS service was not restarted.
- The Prisma schema was updated but `prisma generate` was not re-run.
- A raw SQL query references a column name that does not match the database (e.g., camelCase in code vs. snake_case in Postgres).

**Fix**:
1. Check the NestJS console output for the full error stack trace.
2. Compare the Prisma schema (`database/prisma/schema.prisma`) with the actual database tables.
3. Run `pnpm prisma generate` if the schema was updated.
4. Run `pnpm prisma db push` or apply migrations if columns are missing.

### 3. CORS errors in the browser

**Symptom**: Browser console shows `Access to XMLHttpRequest ... has been blocked by CORS policy`.

**Fix**: Each NestJS service has `enableCors({ origin: [...] })` in its `main.ts`. Verify that the frontend URL (e.g., `http://localhost:4301`) is included in the `origin` array.

Common file locations:
- `apps/admin-api/src/main.ts`
- `apps/developer-portal-api/src/main.ts`
- `apps/sso-service/src/main.ts`
- `apps/audit-service/src/main.ts`

### 4. DATABASE_URL not set

**Symptom**: NestJS services crash on startup with a Prisma connection error or `DATABASE_URL` undefined error.

**Fix**: NestJS services read environment variables from the shell. The `serve:all` and `serve:backend` scripts automatically export from the root `.env` file. If you are running a single service manually:

```bash
# Option A: export from .env first
export $(grep -v '^#' .env | xargs) && pnpm nx serve admin-api

# Option B: create a .env file at the project root and ensure dotenv loads it
```

Make sure the root `.env` file exists and contains at minimum:
```
DATABASE_URL=postgresql://user:password@localhost:5432/sso_platform
```

### 5. Go services fail to start

**Symptom**: authz-service or identity-service exits immediately or panics.

**Likely causes**:
- **Port conflict**: Another process is already on port 8082 or 8083. Kill it with `lsof -ti :8082 | xargs kill`.
- **Missing config.yaml**: Go services may expect a `config.yaml` in their project directory. Check the service's README or `main.go` for the expected config path.
- **Missing environment variables**: Similar to NestJS, Go services may need variables from `.env`. Ensure you are running via `serve:all` or exporting manually.

### 6. Audit service not returning data

**Symptom**: Dashboard "Recent Activity" section is empty. Audit Log page returns no results.

**This may be expected**: The audit service (port 3200) collects events asynchronously. If it is not running or has no data, the Dashboard gracefully degrades (it catches the error silently). Start the audit service and generate some activity (create users, login, etc.) to populate data.

---

## Bypassing OAuth for Local Preview

During development, you may want to view the Admin Console or Developer Portal without going through the full OAuth2 PKCE login flow.

Open the browser console on the Angular app and inject session data:

```javascript
// Set a mock access token (the backend will still validate it -- 
// this only bypasses the frontend auth guard)
sessionStorage.setItem('accessToken', 'mock-dev-token');

// Set the tenant ID (required by all admin-console API calls)
sessionStorage.setItem('tenantId', 'your-tenant-uuid-here');

// Reload the page
location.reload();
```

**Important**: This only bypasses the Angular route guard. The backend APIs will still reject the mock token unless you also configure the backend to skip token validation in development mode.

For a full end-to-end test, use the login portal at `http://localhost:4300` to authenticate and obtain real tokens.

---

## Lint and Test

```bash
# Lint everything
pnpm lint:all

# Test everything
pnpm test:all

# Lint/test a single project
pnpm nx lint admin-console
pnpm nx test admin-api
```

---

## Debugging Tips

### Inspecting API calls in the browser

All Angular services log requests through standard `HttpClient`. Open Chrome DevTools Network tab, filter by "Fetch/XHR" to see all API calls, request payloads, and response bodies.

### Checking what tenant ID is active

```javascript
// In browser console on any Angular app
sessionStorage.getItem('tenantId')
sessionStorage.getItem('accessToken')
```

### Watching NestJS request logs

NestJS services log incoming requests to the terminal. Look for the serve output in your terminal to see request method, path, status code, and timing.

### Hot reload behavior

- **Angular apps**: File changes trigger automatic rebuild and browser refresh via Webpack dev server.
- **NestJS apps**: File changes trigger automatic restart via Webpack HMR or `--watch` mode (configured per project in `project.json`).
- **Go services**: Do NOT have automatic hot reload. You must restart them manually after code changes.

---

## Environment Files Reference

| File | Purpose |
|------|---------|
| `.env` (project root) | Backend environment variables (DATABASE_URL, secrets, etc.) |
| `apps/admin-console/src/app/environments/environment.ts` | Frontend API URLs for dev |
| `apps/developer-portal/src/app/environments/environment.ts` | Frontend API URLs for dev |
| `apps/login-portal/src/app/environments/environment.ts` | Frontend API URLs for dev |
