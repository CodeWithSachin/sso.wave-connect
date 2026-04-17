# WaveConnect SSO Platform - Project Overview

## What is This Project?

WaveConnect SSO is a **production-grade, multi-tenant Single Sign-On (SSO) platform** similar to Auth0, Okta, or Google Workspace SSO. It provides centralized identity management, authentication, and authorization for SaaS applications.

### Core Capabilities

- **Single Sign-On (SSO)** - One login across all tenant applications
- **Multi-Tenancy** - Complete data isolation per organization/tenant
- **Relationship-Based Access Control (ReBAC)** - Fine-grained permissions via OpenFGA
- **PASETO Tokens** - Secure, stateless tokens (alternative to JWT with better security defaults)
- **SCIM 2.0** - Automated user provisioning from IdPs (Okta, Azure AD, Google Workspace)
- **OAuth 2.0 + PKCE** - Standard authorization flows for SPAs and server apps
- **WebAuthn/FIDO2** - Passwordless authentication support

---

## Technology Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Frontend** | Angular | 21.2.0 | SPA applications |
| **UI Components** | PrimeNG | 19.x | Enterprise component library |
| **Icons** | ng-icons (Heroicons) | Latest | SVG icon system |
| **State Management** | @ngrx/signals | 21.1.0 | Signal-based stores |
| **Styling** | Tailwind CSS | 4.2.2 | Utility-first CSS |
| **Auth Hot Path** | Go (Fiber) | 1.23+ | Identity, SSO, AuthZ services |
| **Platform CRUD** | NestJS | 11.x | Admin API, Dev Portal API, Webhooks, Audit |
| **Database** | PostgreSQL | 16 | Primary data store |
| **Cache** | Redis | 7 | Session cache, rate limiting |
| **Authorization** | OpenFGA | Latest | ReBAC engine |
| **Messaging** | NATS | 2 | Event streaming, cache invalidation |
| **ORM** | Prisma | 6.19.3 | NestJS database access |
| **Monorepo** | Nx | 22.6.5 | Build system, task orchestration |
| **Package Manager** | pnpm | Latest | Fast, disk-efficient |

---

## Architecture Overview

```
                    Browser Clients
                         |
          +--------------+--------------+
          |              |              |
    Login Portal   Admin Console  Developer Portal
    (Angular:4300) (Angular:4301) (Angular:4302)
          |              |              |
          +--------------+--------------+
                         |
                    SSO Service (Go:8083)
                    OAuth2/PKCE flows
                         |
          +--------------+--------------+
          |              |              |
   Identity Service  AuthZ Service   Admin API
   (Go:3000)        (Go:8082)       (NestJS:3100)
   User CRUD         OpenFGA         Tenant mgmt
   Password hashing  Permission      Users, Groups
   PASETO tokens     checks          Policies, IdPs
          |              |              |
          +--------------+--------------+
          |              |              |
     PostgreSQL      Redis          NATS
     (:5433)         (:6379)        (:4222)
```

---

## Monorepo Structure

```
sso.wave-connect/
|-- apps/
|   |-- login-portal/          # Angular - User-facing login/register (:4300)
|   |-- admin-console/         # Angular - Tenant admin dashboard (:4301)
|   |-- developer-portal/      # Angular - Developer tools & API keys (:4302)
|   |-- identity-service/      # Go/Fiber - Auth, user CRUD, PASETO (:3000)
|   |-- sso-service/           # Go/Fiber - OAuth2 flows, SSO (:8083)
|   |-- authz-service/         # Go/Fiber - OpenFGA, permissions (:8082 + gRPC:50051)
|   |-- admin-api/             # NestJS - Admin CRUD operations (:3100)
|   |-- developer-portal-api/  # NestJS - API keys, OAuth apps (:3500)
|   |-- webhook-service/       # NestJS - Webhook dispatch (:3300)
|   |-- audit-service/         # NestJS - Audit log storage (:3400)
|   |-- directory-service/     # NestJS - SCIM provisioning (:3200)
|-- libs/
|   |-- ui-components/         # Shared Angular UI components
|   |-- shared-types/          # TypeScript interfaces
|   |-- auth-guards/           # NestJS PASETO validation
|   |-- proto/                 # Protocol Buffer definitions
|   |-- nats/                  # Go NATS client library
|-- infra/
|   |-- docker/                # Docker Compose, Postgres init, monitoring
|-- KT/                        # Knowledge Transfer documentation (this folder)
```

---

## The Three Angular Apps

### 1. Login Portal (:4300)
- **Audience**: End users
- **Features**: Login, Register, MFA enrollment, Password reset, WebAuthn
- **Auth**: Direct interaction with identity-service and sso-service

### 2. Admin Console (:4301)
- **Audience**: Tenant administrators
- **Features**: Dashboard, User management, Groups, Security policies, Webhooks, Audit log, SCIM config
- **Auth**: OAuth2 PKCE via sso-service, talks to admin-api (:3100)
- **7 pages**: Dashboard, Users, Groups, Policies, Webhooks, Audit Log, SCIM

### 3. Developer Portal (:4302)
- **Audience**: Developers integrating with WaveConnect
- **Features**: API key management, OAuth app registration, SDK docs, SCIM tokens
- **Auth**: OAuth2 PKCE via sso-service, talks to developer-portal-api (:3500)
- **5 pages**: Dashboard, API Keys, OAuth Apps, Documentation, SCIM Tokens

---

## Key Design Decisions

### Why Go + NestJS (not one or the other)?
- **Go services** handle the authentication hot path (login, token validation, permission checks) where low latency is critical
- **NestJS services** handle CRUD operations (admin management, webhook dispatch) where developer productivity and Swagger auto-generation matter more than raw speed

### Why PASETO instead of JWT?
- PASETO has no algorithm confusion attacks (a common JWT vulnerability)
- Built-in versioning (v4 = Ed25519 + XChaCha20)
- Simpler API with fewer footguns

### Why OpenFGA for Authorization?
- Supports Relationship-Based Access Control (ReBAC) like Google Zanzibar
- Declarative authorization model (who has what relation to what object)
- Scales independently from the application

### Why Signals + SignalStore (not NgRx Store)?
- Lighter weight for a dashboard-style app
- No actions/reducers/effects boilerplate
- Native Angular signal integration (zoneless change detection)
- `@ngrx/signals` provides `signalStore` with `withState`, `withComputed`, `withMethods`, `withHooks`

### Why PrimeNG + Tailwind (not standalone Tailwind components)?
- PrimeNG provides enterprise-grade data tables, dialogs, date pickers out of the box
- Tailwind provides the design token system and utility classes
- Combined via PrimeNG's Pass-Through (PT) API to apply Tailwind classes to PrimeNG internals

---

## Multi-Tenancy Model

Every API request is scoped to a tenant:
- Angular apps send `X-Tenant-ID` header (admin-console) or extract from token
- All database queries filter by `tenant_id`
- PostgreSQL Row-Level Security (RLS) provides defense-in-depth
- Each tenant can have its own IdP configuration, security policies, and branding

---

## Database Schema Highlights

- **TypeID** primary keys (UUIDv7-based, K-sortable, prefixed)
- **Optimistic locking** via `version` column (PATCH returns 409 on conflict)
- **Soft deletes** via `deleted_at` timestamp (WHERE deleted_at IS NULL)
- **Outbox pattern** for AuthZ sync (writes to `authz_outbox`, worker syncs to OpenFGA)
- **Audit trail** via append-only `audit_log` table

---

## Quick Reference: Ports

| Port | Service | Type |
|------|---------|------|
| 3000 | identity-service | Go |
| 3100 | admin-api | NestJS |
| 3200 | directory-service | NestJS |
| 3300 | webhook-service | NestJS |
| 3400 | audit-service | NestJS |
| 3500 | developer-portal-api | NestJS |
| 4300 | login-portal | Angular |
| 4301 | admin-console | Angular |
| 4302 | developer-portal | Angular |
| 5433 | PostgreSQL | Docker |
| 6379 | Redis | Docker |
| 4222 | NATS | Docker |
| 8080 | OpenFGA HTTP | Docker |
| 8081 | OpenFGA gRPC | Docker |
| 8082 | authz-service HTTP | Go |
| 8083 | sso-service | Go |
| 50051 | authz-service gRPC | Go |
| 50052 | identity-service gRPC | Go |
