# Building a SaaS SSO with ReBAC Using OpenFGA

### A Google-Inspired, Production-Grade Architecture Guide

---

## Table of Contents

1. [Vision & Core Concepts](#1-vision--core-concepts)
2. [Technology Stack](#2-technology-stack)
3. [System Architecture](#3-system-architecture)
4. [Phase 1 — Foundation (Basic)](#4-phase-1--foundation)
5. [Phase 2 — Core SSO & ReBAC (Intermediate)](#5-phase-2--core-sso--rebac)
6. [Phase 3 — Advanced Features](#6-phase-3--advanced-features)
7. [Phase 4 — Scalability & Production Hardening](#7-phase-4--scalability--production-hardening)
8. [OpenFGA Deep Dive](#8-openfga-deep-dive)
9. [API Design](#9-api-design)
10. [Multi-Tenancy Strategy](#10-multi-tenancy-strategy)
11. [Deployment & Infrastructure](#11-deployment--infrastructure)
12. [Monitoring & Observability](#12-monitoring--observability)
13. [Security Checklist](#13-security-checklist)
14. [Cost Estimation & Scaling Benchmarks](#14-cost-estimation--scaling-benchmarks)

---

## 1. Vision & Core Concepts

### What You're Building

A **Google-like identity platform** that provides:

- **Single Sign-On (SSO):** One login to access all connected applications (like logging into Gmail gives you YouTube, Drive, etc.)
- **Relationship-Based Access Control (ReBAC):** Permissions derived from relationships between entities, not just roles. "User X can edit Document Y because they are a member of Team Z which owns Folder W which contains Document Y."
- **Multi-Tenant SaaS:** Each customer (organization) gets an isolated environment with their own users, apps, and authorization policies.

### Why ReBAC Over RBAC?

**RBAC (Role-Based):** User → Role → Permission. Flat and rigid. Struggles with: "Can user A edit this specific document inside this specific folder owned by this specific team?"

**ReBAC (Relationship-Based):** Models the real world. Permissions flow through a graph of relationships. Google Drive, Google Docs, GitHub, Airbnb — all use ReBAC internally. OpenFGA is the open-source implementation of Google's Zanzibar paper, which powers Google's authorization.

### Core Entities in Your System

```
Organization (Tenant)
├── Users
├── Groups / Teams
├── Applications (connected SaaS apps)
├── Resources (documents, projects, repos, etc.)
├── Policies (authorization models)
└── Identity Providers (SAML, OIDC connections)
```

---

## 2. Technology Stack

### Primary Stack

| Layer                      | Technology                                                                                                              | Why                                                                                                                                                                                                            |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Backend (Auth Core)**    | Go (Fiber)                                                                                                              | Token issuance, PASETO encrypt/decrypt, OpenFGA checks, SAML/OIDC — all hot-path, latency-critical. Go's goroutines handle 50K+ concurrent auth checks.                                                        |
| **Backend (Platform API)** | NestJS (TypeScript)                                                                                                     | Admin API, tenant management, webhook delivery, SCIM proxy, developer portal API. NestJS provides decorators, DI, guards, interceptors, Swagger gen — enterprise patterns that accelerate CRUD-heavy services. |
| **Frontend**               | Angular 18+ (standalone components)                                                                                     | Admin console, login/consent portal, developer portal. Angular's built-in DI, reactive forms, route guards, and HttpInterceptors align naturally with auth UIs.                                                |
| **Styling**                | Tailwind CSS 4+ + Angular CDK                                                                                           | Utility-first CSS for rapid, consistent UI. Angular CDK provides accessible primitives (overlays, drag-drop, a11y) without opinionated styling — Tailwind handles all visuals.                                 |
| **Authorization Engine**   | OpenFGA                                                                                                                 | Google Zanzibar implementation, purpose-built for ReBAC                                                                                                                                                        |
| **Identity/Auth Protocol** | Custom OIDC Provider (`fosite` for Go)                                                                                  | Full control over token issuance, Go-native                                                                                                                                                                    |
| **Token Format**           | PASETO v4 everywhere: access tokens (v4.local), auth codes (v4.local), refresh tokens (v4.local), ID tokens (v4.public) | Self-contained encrypted tokens replace opaque UUIDs; no database lookup needed                                                                                                                                |
| **PASETO Library**         | `aidanwoods.dev/go-paseto` (Go), `paseto` (TS/npm)                                                                      | Most mature v4 implementation; 229+ Go importers                                                                                                                                                               |
| **Entity IDs**             | TypeID (`go.jetify.com/typeid`)                                                                                         | Type-prefixed ULIDs — sortable, type-safe, index-friendly. Replaces UUID v4.                                                                                                                                   |
| **Primary Database**       | PostgreSQL 16+                                                                                                          | JSONB for flexible schemas, row-level security, partitioning                                                                                                                                                   |
| **ORM**                    | Go: `sqlc` (type-safe SQL); NestJS: Prisma or TypeORM                                                                   | sqlc generates Go from SQL (zero runtime overhead); Prisma gives NestJS type-safe queries + migrations                                                                                                         |
| **Cache**                  | Redis Cluster (Dragonfly as alternative)                                                                                | Token deny-list, rate limiting, OpenFGA decision cache                                                                                                                                                         |
| **Message Queue**          | NATS JetStream or Apache Kafka                                                                                          | Event-driven architecture for audit logs, webhooks, sync                                                                                                                                                       |
| **Search**                 | Meilisearch or Elasticsearch                                                                                            | User/group/app search across tenants                                                                                                                                                                           |
| **API Gateway**            | Kong or NestJS gateway module                                                                                           | Rate limiting, API key management, routing. NestJS can serve as a lightweight gateway via `@nestjs/microservices` for smaller deployments.                                                                     |
| **Infrastructure**         | Kubernetes (EKS/GKE) + Terraform                                                                                        | Container orchestration + IaC                                                                                                                                                                                  |
| **CI/CD**                  | GitHub Actions + ArgoCD                                                                                                 | GitOps deployment                                                                                                                                                                                              |
| **Observability**          | OpenTelemetry + Grafana Stack (Loki, Tempo, Mimir)                                                                      | Full observability                                                                                                                                                                                             |
| **Secret Management**      | HashiCorp Vault                                                                                                         | Secrets, PKI, encryption keys                                                                                                                                                                                  |

### Why Go + NestJS? (Split Backend)

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Backend Service Split                             │
│                                                                     │
│  GO (Fiber) — Hot Path                NestJS — Platform Path        │
│  ┌──────────────────────┐             ┌──────────────────────┐     │
│  │ identity-service     │             │ admin-api            │     │
│  │ • Login / Register   │             │ • Tenant CRUD        │     │
│  │ • PASETO v4 tokens   │             │ • User management    │     │
│  │ • MFA verification   │             │ • Dashboard data     │     │
│  │ • Password hashing   │             │ • Swagger/OpenAPI    │     │
│  ├──────────────────────┤             ├──────────────────────┤     │
│  │ authz-service        │             │ webhook-service      │     │
│  │ • OpenFGA checks     │             │ • Event delivery     │     │
│  │ • Tuple CRUD         │             │ • Retry logic        │     │
│  │ • Batch checks       │             │ • Endpoint CRUD      │     │
│  ├──────────────────────┤             ├──────────────────────┤     │
│  │ sso-service          │             │ directory-service    │     │
│  │ • OIDC Provider      │             │ • SCIM proxy         │     │
│  │ • SAML IdP/SP        │             │ • Group management   │     │
│  │ • Token endpoint     │             │ • User search        │     │
│  └──────────────────────┘             ├──────────────────────┤     │
│                                       │ developer-portal-api │     │
│  Why Go here:                         │ • API key management │     │
│  • 2μs PASETO encrypt                 │ • SDK docs           │     │
│  • 25μs Ed25519 sign                  │ • Webhook logs       │     │
│  • Goroutines for 50K rps             └──────────────────────┘     │
│  • Zero GC pauses on hot path                                       │
│                                       Why NestJS here:              │
│                                       • Decorators + Guards         │
│                                       • Auto Swagger/OpenAPI        │
│                                       • Prisma type-safe queries    │
│                                       • Fast feature iteration      │
│                                       • Shared TS types w/ Angular  │
└─────────────────────────────────────────────────────────────────────┘
```

### Alternative Stack (Simpler Start)

If you want to ship faster initially, use NestJS for everything (including auth), Prisma ORM, SQLite → PostgreSQL migration path, BullMQ instead of Kafka, and deploy on Railway or Render. Migrate the hot-path services to Go later when latency matters.

### Why PASETO v4 Over JWT?

This architecture uses **PASETO (Platform-Agnostic Security Tokens)** instead of JWT throughout. PASETO was designed by cryptographer Scott Arciszewski specifically to fix the design flaws in the JOSE/JWT specifications. Here's why it matters:

**The Problem with JWT:**

JWT's `alg` header lets the token itself dictate which cryptographic algorithm to use for verification. This has led to well-documented attacks where attackers swap `RS256` with `HS256` and use the server's known public key as the HMAC secret — forging valid tokens. JWT also permits weak algorithms (like `none`), RSA with PKCS1v1.5 (vulnerable to Bleichenbacher attacks), and ECDSA with curves that can leak private keys. Every JWT implementation must handle this complexity, and mistakes are catastrophic.

**How PASETO Fixes It:**

PASETO eliminates algorithm agility entirely. Instead of choosing algorithms, you choose a **version** and a **purpose**:

```
┌────────────────────────────────────────────────────────────────────┐
│                    PASETO v4 (Recommended)                         │
│                                                                    │
│  v4.local  (Symmetric / Encrypted)                                │
│    • XChaCha20 + BLAKE2b for authenticated encryption             │
│    • Your services both create AND verify tokens                   │
│    • Use for: access tokens, inter-service tokens                 │
│    • Payload is ENCRYPTED — attackers see nothing                 │
│                                                                    │
│  v4.public (Asymmetric / Signed)                                  │
│    • Ed25519 digital signatures                                    │
│    • One service creates, many services verify                    │
│    • Use for: ID tokens, tokens shared with third parties         │
│    • Payload is VISIBLE but TAMPER-PROOF                          │
│                                                                    │
│  Token Format: version.purpose.payload.optional_footer            │
│  Example:      v4.local.eNgz8SS0...footer                        │
└────────────────────────────────────────────────────────────────────┘
```

**Key Advantages for This SSO Platform:**

| Concern                     | JWT                                    | PASETO v4                                                          |
| --------------------------- | -------------------------------------- | ------------------------------------------------------------------ |
| Algorithm confusion attacks | Possible (alg header)                  | Impossible (no alg header)                                         |
| Encryption                  | Optional (JWE, complex)                | Built-in with `v4.local`                                           |
| Signing algorithm           | Developer chooses (many bad options)   | Ed25519 only (no bad options)                                      |
| Token payload visibility    | Always visible (base64, not encrypted) | Encrypted by default with `local`                                  |
| Cryptographic primitives    | RSA/ECDSA/HMAC (varied quality)        | XChaCha20 + BLAKE2b + Ed25519 (all best-in-class)                  |
| Footer for key rotation     | Not standard                           | Built-in `kid` in footer                                           |
| Replay protection           | None built-in                          | None built-in (use JTI deny-list + token family tracking in Redis) |

**Hybrid Approach for OIDC Compliance:**

The OIDC specification mandates JWT for ID Tokens (RFC 7519). Our architecture handles this with a dual strategy:

- **Access Tokens → PASETO v4.local** (encrypted, used between your services)
- **ID Tokens → JWT (RS256)** (only when OIDC spec compliance is required for third-party consumers)
- **Inter-service tokens → PASETO v4.local** (encrypted, shared symmetric key via Vault)
- **Refresh Tokens → PASETO v4.local** (self-contained, encrypted; Redis for deny-list + family tracking only)
- **Auth Codes → PASETO v4.local** (self-contained, encrypted; single-use via JTI deny-list)
- **MFA Challenges → PASETO v4.local** (self-contained, encrypted; zero DB lookup)

This gives you maximum security for internal flows while maintaining compatibility with the OIDC ecosystem.

---

## 3. System Architecture

### High-Level Architecture

```
                     ┌──────────────────────────────────────┐
                     │         Angular Frontend Apps         │
                     │  admin-console / login-portal / devs  │
                     │     (Angular 18+ / Tailwind CSS)      │
                     └──────────────────┬───────────────────┘
                                        │
                        ┌───────────────▼───────────────┐
                        │       Load Balancer (L7)       │
                        │     (Cloudflare / AWS ALB)      │
                        └───────────────┬───────────────┘
                                        │
                        ┌───────────────▼───────────────┐
                        │        API Gateway             │
                        │   (Kong / NestJS Gateway)      │
                        │   Rate limit, Auth, Routing    │
                        └───────────────┬───────────────┘
                                        │
          ┌─────────────────────────────┼─────────────────────────────┐
          │           GO (Fiber)        │         NestJS              │
          │         Hot Path            │       Platform Path         │
          │                             │                             │
┌─────────▼─────────┐   ┌──────────────▼──────────┐   ┌─────────────▼────────┐
│  Identity Service  │   │  Admin API              │   │   Webhook Service    │
│  (Go)              │   │  (NestJS)               │   │   (NestJS)           │
│ • Registration     │   │ • Tenant CRUD           │   │ • Event delivery     │
│ • Authentication   │   │ • User management       │   │ • Retry queue        │
│ • MFA              │   │ • Dashboard aggregation │   │ • Endpoint CRUD      │
│ • PASETO tokens    │   │ • Swagger/OpenAPI       │   │                      │
│ • Session Mgmt     │   │ • Feature flags         │   │                      │
├────────────────────┤   ├─────────────────────────┤   ├──────────────────────┤
│  AuthZ Service     │   │  Directory Service      │   │   Audit Service      │
│  (Go)              │   │  (NestJS)               │   │   (NestJS)           │
│ • OpenFGA checks   │   │ • Groups / Teams        │   │ • Immutable logs     │
│ • Tuple CRUD       │   │ • SCIM 2.0 proxy        │   │ • Compliance reports │
│ • Batch checks     │   │ • Membership sync       │   │ • Event streaming    │
├────────────────────┤   ├─────────────────────────┤   │                      │
│  SSO Service       │   │  Developer Portal API   │   │                      │
│  (Go)              │   │  (NestJS)               │   │                      │
│ • OIDC Provider    │   │ • API key management    │   │                      │
│ • SAML IdP/SP      │   │ • SDK docs              │   │                      │
│ • Token endpoint   │   │ • Usage analytics       │   │                      │
└────────┬───────────┘   └────────────┬────────────┘   └──────────┬───────────┘
         │                            │                            │
         │              ┌─────────────▼────────────┐               │
         │              │       OpenFGA            │               │
         │              │  (Authorization Store)   │               │
         │              └─────────────┬────────────┘               │
         │                            │                            │
┌────────▼────────────────────────────▼────────────────────────────▼──────────┐
│                           Data Layer                                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐   │
│  │ Postgres │  │  Redis   │  │  NATS/   │  │  Vault   │  │ Object     │   │
│  │ (Primary)│  │(DenyList)│  │  Kafka   │  │ (Secrets)│  │ Storage(S3)│   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └────────────┘   │
└────────────────────────────────────────────────────────────────────────────┘
```

### Microservice Boundaries

| Service                | Language       | Responsibility                                                    | Database                                   |
| ---------------------- | -------------- | ----------------------------------------------------------------- | ------------------------------------------ |
| `identity-service`     | **Go (Fiber)** | User lifecycle, authentication, sessions, MFA, password hashing   | Postgres (users, credentials)              |
| `authz-service`        | **Go (Fiber)** | OpenFGA wrapper, permission checks, policy CRUD, batch checks     | OpenFGA store + Postgres (policy metadata) |
| `sso-service`          | **Go (Fiber)** | OIDC Provider, SAML IdP/SP, PASETO token issuance, consent        | Postgres (clients, grants)                 |
| `admin-api`            | **NestJS**     | Tenant CRUD, user management, dashboard aggregation, Swagger docs | Aggregates from Go services                |
| `directory-service`    | **NestJS**     | Groups, teams, SCIM 2.0 provisioning, user-org memberships        | Postgres (groups, memberships)             |
| `webhook-service`      | **NestJS**     | Event delivery, retry logic, endpoint management                  | BullMQ (queue) + Postgres (configs)        |
| `audit-service`        | **NestJS**     | Immutable audit logs, compliance reports, event streaming         | Postgres (append-only) + S3 (archive)      |
| `developer-portal-api` | **NestJS**     | API key management, SDK docs, usage analytics                     | Postgres (api_keys, usage)                 |

**Rule of thumb:** If the service touches PASETO tokens, cryptography, or handles >10K rps → Go. If it's CRUD, admin UI backing, or developer-facing → NestJS.

---

## 4. Phase 1 — Foundation

### Step 1: Project Setup

```bash
# Monorepo structure (Nx recommended — first-class Angular + NestJS support)
sso-platform/
├── apps/
│   │
│   │ # ─── Go Services (auth hot-path) ───
│   ├── identity-service/           # Go (Fiber) — login, register, MFA, PASETO tokens
│   ├── authz-service/              # Go (Fiber) — OpenFGA checks, tuple CRUD
│   ├── sso-service/                # Go (Fiber) — OIDC/SAML provider, token endpoint
│   │
│   │ # ─── NestJS Services (platform APIs) ───
│   ├── admin-api/                  # NestJS — tenant management, user CRUD, dashboard
│   ├── directory-service/          # NestJS — groups, SCIM provisioning
│   ├── webhook-service/            # NestJS — event delivery, retry queue
│   ├── audit-service/              # NestJS — immutable audit logs
│   ├── developer-portal-api/       # NestJS — API keys, SDK docs, usage
│   │
│   │ # ─── Angular Frontend Apps ───
│   ├── admin-console/              # Angular 18+ — org admin dashboard
│   ├── login-portal/               # Angular 18+ — login, consent, MFA screens
│   └── developer-portal/           # Angular 18+ — API docs, key management
│
├── libs/                           # Nx shared libraries
│   ├── shared-types/               # TypeScript interfaces (shared between NestJS + Angular)
│   ├── ui-components/              # Angular component library (Tailwind-styled)
│   ├── auth-guards/                # Angular route guards + HTTP interceptors
│   ├── api-client/                 # Auto-generated Angular HttpClient from NestJS Swagger
│   ├── sdk-node/                   # Node.js SDK for customers
│   ├── sdk-go/                     # Go SDK for customers
│   └── proto/                      # Protobuf definitions (Go ↔ NestJS gRPC)
│
├── infra/
│   ├── terraform/
│   ├── kubernetes/
│   └── docker/
├── openfga/
│   ├── model.fga                   # Authorization model
│   └── tuples/                     # Seed relationship tuples
├── nx.json                         # Nx workspace config
├── tsconfig.base.json              # Shared TS config for NestJS + Angular
└── docs/
```

### Step 2: Database Schema (PostgreSQL)

#### Why TypeID Over UUID v4?

UUID v4 (`550e8400-e29b-41d4-a716-446655440000`) has three problems at scale: it's not sortable (random distribution kills B-tree index locality), it's not type-safe (you can accidentally pass a user ID where a tenant ID is expected), and it's not human-readable during debugging.

**TypeID** solves all three: it's a type-prefixed ULID that looks like `usr_01HZRTTG1NQJNE4EYSGFGH4RPC`. The ULID portion is timestamp-ordered (sortable), the prefix tells you what kind of entity it is, and the whole thing is URL-safe.

```
UUID v4:   550e8400-e29b-41d4-a716-446655440000  ← random, unsortable, untyped
TypeID:    usr_01HZRTTG1NQJNE4EYSGFGH4RPC        ← sorted by creation time, typed, URL-safe

Format:    <type_prefix>_<ulid>
           └── 1-63 chars  └── 26 chars (Crockford base32 encoded ULID)
```

In PostgreSQL, store TypeIDs as `VARCHAR(100)` (or `TEXT`). The ULID component is timestamp-sortable, so range queries and pagination on `id` are efficient without needing a separate `created_at` index for ordering.

```sql
-- ═══════════════════════════════════════════════════════════════
-- TypeID helper function (generates type-prefixed ULIDs in SQL)
-- In practice, generate TypeIDs in Go using go.jetify.com/typeid
-- ═══════════════════════════════════════════════════════════════
-- CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Tenants / Organizations
CREATE TABLE tenants (
    id              VARCHAR(100) PRIMARY KEY,        -- TypeID: ten_01HZRTTG1NQJNE4EYSGFGH4RPC
    name            VARCHAR(255) NOT NULL,
    slug            VARCHAR(100) UNIQUE NOT NULL,
    domain          VARCHAR(255),
    logo_url        TEXT,
    plan            VARCHAR(50) DEFAULT 'free',
    settings        JSONB DEFAULT '{}',
    openfga_store_id VARCHAR(100),                   -- Each tenant gets their own OpenFGA store
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Users
CREATE TABLE users (
    id              VARCHAR(100) PRIMARY KEY,        -- TypeID: usr_01HZRTTG1NQJNE4EYSGFGH4RPC
    email           VARCHAR(255) NOT NULL,
    email_verified  BOOLEAN DEFAULT FALSE,
    password_hash   VARCHAR(255),                    -- NULL for SSO-only users
    display_name    VARCHAR(255),
    avatar_url      TEXT,
    status          VARCHAR(20) DEFAULT 'active',    -- active, suspended, deactivated
    mfa_enabled     BOOLEAN DEFAULT FALSE,
    mfa_secret      TEXT,                            -- Encrypted TOTP secret
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(email)
);

-- User-Tenant Memberships (a user can belong to multiple orgs)
CREATE TABLE memberships (
    id              VARCHAR(100) PRIMARY KEY,        -- TypeID: mem_...
    user_id         VARCHAR(100) REFERENCES users(id) ON DELETE CASCADE,
    tenant_id       VARCHAR(100) REFERENCES tenants(id) ON DELETE CASCADE,
    role            VARCHAR(50) DEFAULT 'member',    -- owner, admin, member
    joined_at       TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, tenant_id)
);

-- OAuth2/OIDC Clients (applications connected to SSO)
CREATE TABLE oauth_clients (
    id              VARCHAR(100) PRIMARY KEY,        -- TypeID: app_...
    tenant_id       VARCHAR(100) REFERENCES tenants(id) ON DELETE CASCADE,
    client_id       VARCHAR(255) UNIQUE NOT NULL,
    client_secret   VARCHAR(255) NOT NULL,           -- Hashed
    name            VARCHAR(255) NOT NULL,
    redirect_uris   TEXT[] NOT NULL,
    grant_types     TEXT[] DEFAULT '{authorization_code, refresh_token}',
    scopes          TEXT[] DEFAULT '{openid, profile, email}',
    token_endpoint_auth_method VARCHAR(50) DEFAULT 'client_secret_basic',
    logo_url        TEXT,
    is_first_party  BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Sessions (lightweight — actual session data lives inside PASETO tokens)
-- This table exists only for server-side revocation and audit
CREATE TABLE sessions (
    id              VARCHAR(100) PRIMARY KEY,        -- TypeID: ses_...
    user_id         VARCHAR(100) REFERENCES users(id) ON DELETE CASCADE,
    tenant_id       VARCHAR(100) REFERENCES tenants(id),
    token_hash      VARCHAR(255) UNIQUE NOT NULL,    -- Hash of PASETO session token
    ip_address      INET,
    user_agent      TEXT,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Identity Providers (SAML/OIDC connections per tenant)
CREATE TABLE identity_providers (
    id              VARCHAR(100) PRIMARY KEY,        -- TypeID: idp_...
    tenant_id       VARCHAR(100) REFERENCES tenants(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    type            VARCHAR(20) NOT NULL,            -- saml, oidc
    config          JSONB NOT NULL,                  -- Encrypted metadata
    domain_hint     VARCHAR(255),                    -- e.g., "@company.com"
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Audit Logs (append-only)
CREATE TABLE audit_logs (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       VARCHAR(100) NOT NULL,
    actor_id        VARCHAR(100),
    actor_type      VARCHAR(50),                     -- user, system, api_key
    action          VARCHAR(100) NOT NULL,            -- user.login, permission.check, etc.
    resource_type   VARCHAR(100),
    resource_id     VARCHAR(255),
    metadata        JSONB DEFAULT '{}',
    ip_address      INET,
    created_at      TIMESTAMPTZ DEFAULT NOW()
) PARTITION BY RANGE (created_at);

-- Create monthly partitions
CREATE TABLE audit_logs_2026_01 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
-- ... repeat for each month

-- Indexes (TypeIDs are already sortable, so range scans work well)
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_memberships_user ON memberships(user_id);
CREATE INDEX idx_memberships_tenant ON memberships(tenant_id);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_token ON sessions(token_hash);
CREATE INDEX idx_audit_tenant_action ON audit_logs(tenant_id, action, created_at DESC);
```

#### TypeID Generation in Go

```go
// shared/id/typeid.go

import "go.jetify.com/typeid"

// Generate TypeIDs for each entity type
func NewUserID() string       { return typeid.Must(typeid.WithPrefix("usr")).String() }
func NewTenantID() string     { return typeid.Must(typeid.WithPrefix("ten")).String() }
func NewMembershipID() string { return typeid.Must(typeid.WithPrefix("mem")).String() }
func NewAppID() string        { return typeid.Must(typeid.WithPrefix("app")).String() }
func NewSessionID() string    { return typeid.Must(typeid.WithPrefix("ses")).String() }
func NewIdpID() string        { return typeid.Must(typeid.WithPrefix("idp")).String() }
func NewWebhookID() string    { return typeid.Must(typeid.WithPrefix("whk")).String() }
func NewGroupID() string      { return typeid.Must(typeid.WithPrefix("grp")).String() }

// Type-safe ID validation
func ValidateUserID(id string) error {
    tid, err := typeid.FromString(id)
    if err != nil { return err }
    if tid.Prefix() != "usr" {
        return fmt.Errorf("expected user ID (usr_...), got %s", tid.Prefix())
    }
    return nil
}

// Token IDs (jti) use crypto-random strings, not ULIDs
// Matches PASETO spec convention: {"jti":"87IFSGFgPNtQNNuw0AtuLttP"}
func NewTokenID() string {
    b := make([]byte, 18) // 144 bits of entropy → 24-char base64
    crypto_rand.Read(b)
    return base64.RawURLEncoding.EncodeToString(b)
}
```

### Step 3: Basic User Registration & Authentication

```go
// identity-service/internal/handler/auth.go (Go + Fiber example)

package handler

import (
    "github.com/gofiber/fiber/v2"
    "golang.org/x/crypto/bcrypt"
    "aidanwoods.dev/go-paseto"
)

type RegisterRequest struct {
    Email       string `json:"email" validate:"required,email"`
    Password    string `json:"password" validate:"required,min=12"`
    DisplayName string `json:"display_name" validate:"required"`
    TenantSlug  string `json:"tenant_slug"`
}

func (h *AuthHandler) Register(c *fiber.Ctx) error {
    var req RegisterRequest
    if err := c.BodyParser(&req); err != nil {
        return c.Status(400).JSON(fiber.Map{"error": "invalid request"})
    }

    // 1. Check if user exists
    existing, _ := h.userRepo.FindByEmail(c.Context(), req.Email)
    if existing != nil {
        return c.Status(409).JSON(fiber.Map{"error": "email already registered"})
    }

    // 2. Hash password (bcrypt with cost 12, or use Argon2id)
    hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), 12)
    if err != nil {
        return c.Status(500).JSON(fiber.Map{"error": "internal error"})
    }

    // 3. Create user
    user, err := h.userRepo.Create(c.Context(), &User{
        Email:        req.Email,
        PasswordHash: string(hash),
        DisplayName:  req.DisplayName,
    })
    if err != nil {
        return c.Status(500).JSON(fiber.Map{"error": "failed to create user"})
    }

    // 4. If tenant specified, create membership + OpenFGA relationship
    if req.TenantSlug != "" {
        tenant, err := h.tenantRepo.FindBySlug(c.Context(), req.TenantSlug)
        if err == nil {
            h.membershipRepo.Create(c.Context(), user.ID, tenant.ID, "member")

            // Write OpenFGA relationship tuple
            // With TypeIDs, tuples become: user:usr_01HZRTTG... → member → organization:ten_01HZRTTG...
            h.authzClient.WriteTuples(c.Context(), tenant.OpenFGAStoreID, []Tuple{
                {
                    User:     fmt.Sprintf("user:%s", user.ID),     // user:usr_01HZRTTG...
                    Relation: "member",
                    Object:   fmt.Sprintf("organization:%s", tenant.ID), // organization:ten_01HZRTTG...
                },
            })
        }
    }

    // 5. Send verification email (async via message queue)
    h.eventBus.Publish("user.registered", UserRegisteredEvent{
        UserID: user.ID,
        Email:  user.Email,
    })

    return c.Status(201).JSON(fiber.Map{
        "user": user.ToPublic(),
        "message": "verification email sent",
    })
}

func (h *AuthHandler) Login(c *fiber.Ctx) error {
    var req LoginRequest
    if err := c.BodyParser(&req); err != nil {
        return c.Status(400).JSON(fiber.Map{"error": "invalid request"})
    }

    // 1. Find user
    user, err := h.userRepo.FindByEmail(c.Context(), req.Email)
    if err != nil {
        return c.Status(401).JSON(fiber.Map{"error": "invalid credentials"})
    }

    // 2. Check if domain has an IdP configured (enterprise SSO redirect)
    domain := extractDomain(req.Email)
    idp, _ := h.idpRepo.FindByDomain(c.Context(), domain)
    if idp != nil {
        return c.Status(302).JSON(fiber.Map{
            "redirect": fmt.Sprintf("/sso/%s/authorize?login_hint=%s", idp.ID, req.Email),
            "message": "redirecting to organization SSO",
        })
    }

    // 3. Verify password
    if err := bcrypt.CompareHashAndPassword(
        []byte(user.PasswordHash), []byte(req.Password),
    ); err != nil {
        h.rateLimiter.RecordFailure(req.Email)
        return c.Status(401).JSON(fiber.Map{"error": "invalid credentials"})
    }

    // 4. Check MFA
    if user.MFAEnabled {
        // Create MFA challenge as a PASETO v4.local token (self-contained, no DB lookup)
        // The challenge token encrypts the user ID, timestamp, and allowed methods.
        // When the client sends back the challenge_token + TOTP code, we decrypt
        // to verify — no Redis/DB round-trip needed for the challenge itself.
        challengeToken := h.mfaService.CreateChallengeToken(user.ID, user.MFAMethods())
        return c.Status(200).JSON(fiber.Map{
            "mfa_required":   true,
            "challenge_token": challengeToken, // v4.local.<encrypted_challenge>
            "methods":        user.MFAMethods(),
        })
    }

    // 5. Create session + issue tokens
    session, tokens, err := h.sessionService.Create(c.Context(), user, c.IP(), c.Get("User-Agent"))
    if err != nil {
        return c.Status(500).JSON(fiber.Map{"error": "session creation failed"})
    }

    // 6. Audit log
    h.auditLog.Record(AuditEvent{
        TenantID:   session.TenantID,
        ActorID:    user.ID,
        Action:     "user.login",
        IPAddress:  c.IP(),
    })

    return c.Status(200).JSON(fiber.Map{
        "access_token":  tokens.AccessToken,
        "refresh_token": tokens.RefreshToken,
        "token_type":    "Bearer",
        "expires_in":    tokens.ExpiresIn,
        "user":          user.ToPublic(),
    })
}
```

### Step 4: PASETO v4 Token Service

```go
// identity-service/internal/service/token.go

package service

import (
    "crypto/ed25519"
    crypto_rand "crypto/rand"
    "encoding/base64"
    "encoding/json"
    "fmt"
    "time"

    "aidanwoods.dev/go-paseto"
    "github.com/redis/go-redis/v9"
)

type TokenService struct {
    // v4.local: symmetric key for encrypted access tokens (inter-service)
    localKey    paseto.V4SymmetricKey

    // v4.public: asymmetric keys for signed tokens (shared with third parties)
    secretKey   paseto.V4AsymmetricSecretKey
    publicKey   paseto.V4AsymmetricPublicKey

    // For OIDC-compliant JWT ID tokens (required by spec)
    oidcPrivateKey ed25519.PrivateKey
    oidcPublicKey  ed25519.PublicKey

    issuer      string
    redis       *redis.Client
}

type TokenPair struct {
    AccessToken  string  // PASETO v4.local (encrypted, self-contained)
    RefreshToken string  // PASETO v4.local (encrypted, self-contained — NOT an opaque UUID)
    IDToken      string  // PASETO v4.public (signed, readable by clients)
    ExpiresIn    int64
    TokenType    string  // Always "Bearer"
}

func NewTokenService(issuer string, redis *redis.Client) (*TokenService, error) {
    // Generate PASETO v4 keys
    // In production, load these from HashiCorp Vault
    localKey := paseto.NewV4SymmetricKey()           // For v4.local (encrypted tokens)
    secretKey := paseto.NewV4AsymmetricSecretKey()    // For v4.public (signed tokens)
    publicKey := secretKey.Public()                    // Shared with verifying services

    return &TokenService{
        localKey:  localKey,
        secretKey: secretKey,
        publicKey: publicKey,
        issuer:    issuer,
        redis:     redis,
    }, nil
}

// newTokenID generates a crypto-random token identifier (replaces uuid.New())
// Matches PASETO spec convention: {"jti":"87IFSGFgPNtQNNuw0AtuLttP"}
func newTokenID() string {
    b := make([]byte, 18) // 144 bits of entropy → 24-char base64url string
    crypto_rand.Read(b)
    return base64.RawURLEncoding.EncodeToString(b)
}

// IssueTokens creates a full token set for an authenticated user
// Every bearer token is a self-contained PASETO v4.local — no opaque UUIDs
func (s *TokenService) IssueTokens(user *User, tenant *Tenant, scopes []string) (*TokenPair, error) {
    now := time.Now()
    tokenID := newTokenID() // Crypto-random, not UUID

    // ─── Access Token: PASETO v4.local (ENCRYPTED) ───
    // Only your services can decrypt this. Attackers see nothing.
    // Short-lived: 15 minutes
    accessToken := paseto.NewToken()
    accessToken.SetIssuedAt(now)
    accessToken.SetNotBefore(now)
    accessToken.SetExpiration(now.Add(15 * time.Minute))
    accessToken.SetIssuer(s.issuer)
    accessToken.SetSubject(user.ID)          // TypeID: usr_01HZRTTG...
    accessToken.SetAudience(tenant.ID)       // TypeID: ten_01HZRTTG...
    accessToken.SetJti(tokenID)

    // Custom claims (these are ENCRYPTED, not just base64-encoded like JWT)
    accessToken.SetString("tenant_id", tenant.ID)
    accessToken.SetString("email", user.Email)
    accessToken.SetString("name", user.DisplayName)
    accessToken.Set("scopes", scopes)

    // Encrypt the access token with the symmetric key
    // Footer contains key ID for key rotation (visible but authenticated)
    accessStr := accessToken.V4Encrypt(s.localKey, []byte(`{"kid":"` + s.currentKeyID() + `"}`))

    // ─── ID Token: PASETO v4.public (SIGNED, readable) ───
    // Clients can read claims but cannot modify them.
    // Used for OIDC-like identity assertions.
    idToken := paseto.NewToken()
    idToken.SetIssuedAt(now)
    idToken.SetNotBefore(now)
    idToken.SetExpiration(now.Add(1 * time.Hour))
    idToken.SetIssuer(s.issuer)
    idToken.SetSubject(user.ID)
    idToken.SetAudience(tenant.ClientID)
    idToken.SetJti(newTokenID()) // Crypto-random, not UUID

    // Standard OIDC-like claims (visible to client, tamper-proof)
    idToken.SetString("email", user.Email)
    idToken.Set("email_verified", user.EmailVerified)
    idToken.SetString("name", user.DisplayName)
    idToken.SetString("picture", user.AvatarURL)
    idToken.Set("auth_time", now.Unix())

    // Sign with private key — anyone with the public key can verify
    idStr := idToken.V4Sign(s.secretKey, nil)

    // ─── Refresh Token: PASETO v4.local (SELF-CONTAINED) ───
    // The refresh token IS the data — no separate Redis lookup needed for payload.
    // Redis is only used for the deny-list (revoked token JTIs).
    refreshTokenID := newTokenID()
    familyID := newTokenID()  // For refresh token rotation detection

    refreshToken := paseto.NewToken()
    refreshToken.SetIssuedAt(now)
    refreshToken.SetExpiration(now.Add(30 * 24 * time.Hour)) // 30-day expiry
    refreshToken.SetIssuer(s.issuer)
    refreshToken.SetSubject(user.ID)
    refreshToken.SetJti(refreshTokenID)
    refreshToken.SetString("tenant_id", tenant.ID)
    refreshToken.Set("scopes", scopes)
    refreshToken.SetString("family", familyID) // Token family for rotation detection
    refreshToken.SetString("access_jti", tokenID) // Links to the access token

    refreshStr := refreshToken.V4Encrypt(s.localKey, nil)

    // Track the refresh token family in Redis for rotation/replay detection
    // Only the family tracking goes in Redis — NOT the full token data
    err := s.redis.Set(ctx,
        fmt.Sprintf("refresh_family:%s", familyID),
        refreshTokenID, // Track which JTI is the latest in this family
        30*24*time.Hour,
    ).Err()
    if err != nil {
        return nil, fmt.Errorf("failed to track refresh token family: %w", err)
    }

    return &TokenPair{
        AccessToken:  accessStr,     // v4.local — self-contained, encrypted
        RefreshToken: refreshStr,     // v4.local — self-contained, encrypted (NOT an opaque UUID)
        IDToken:      idStr,          // v4.public — self-contained, signed
        ExpiresIn:    900,
        TokenType:    "Bearer",
    }, nil
}

// VerifyAccessToken decrypts and validates a v4.local PASETO access token
func (s *TokenService) VerifyAccessToken(tokenString string) (*AccessTokenClaims, error) {
    parser := paseto.NewParser()
    parser.AddRule(paseto.NotExpired())
    parser.AddRule(paseto.IssuedBy(s.issuer))
    parser.AddRule(paseto.NotBeforeNbf())

    // Decrypt + validate in one step
    // If the token was tampered with, decryption fails (authenticated encryption)
    // If the token is expired, rule check fails
    // No "alg" header to confuse — there's only one way to decrypt v4.local
    token, err := parser.ParseV4Local(s.localKey, tokenString, nil)
    if err != nil {
        return nil, fmt.Errorf("invalid access token: %w", err)
    }

    // Extract claims from decrypted payload
    claims := &AccessTokenClaims{}
    claims.Subject, _ = token.GetSubject()
    claims.TenantID, _ = token.GetString("tenant_id")
    claims.Email, _ = token.GetString("email")
    claims.Name, _ = token.GetString("name")
    claims.TokenID, _ = token.GetJti()

    var scopes []string
    _ = token.Get("scopes", &scopes)
    claims.Scopes = scopes

    return claims, nil
}

// VerifyIDToken validates a v4.public PASETO ID token using the public key
func (s *TokenService) VerifyIDToken(tokenString string) (*IDTokenClaims, error) {
    parser := paseto.NewParser()
    parser.AddRule(paseto.NotExpired())
    parser.AddRule(paseto.IssuedBy(s.issuer))

    // Verify signature using public key
    // The public key can be distributed freely to any service that needs
    // to verify tokens — similar to JWKS but without algorithm confusion
    token, err := parser.ParseV4Public(s.publicKey, tokenString, nil)
    if err != nil {
        return nil, fmt.Errorf("invalid ID token: %w", err)
    }

    claims := &IDTokenClaims{}
    claims.Subject, _ = token.GetSubject()
    claims.Email, _ = token.GetString("email")
    claims.Name, _ = token.GetString("name")
    claims.EmailVerified, _ = token.Get("email_verified", &claims.EmailVerified)

    return claims, nil
}

// RefreshAccessToken performs refresh token rotation using self-contained PASETO tokens
// The refresh token IS a v4.local PASETO — we decrypt it to get the claims,
// then check the family tracker in Redis for replay detection.
func (s *TokenService) RefreshAccessToken(refreshTokenStr string) (*TokenPair, error) {
    // 1. Decrypt the refresh token (it's a PASETO v4.local, NOT an opaque string)
    //    If expired, tampered, or encrypted with wrong key → instant reject
    parser := paseto.NewParser()
    parser.AddRule(paseto.NotExpired())
    parser.AddRule(paseto.IssuedBy(s.issuer))

    token, err := parser.ParseV4Local(s.localKey, refreshTokenStr, nil)
    if err != nil {
        return nil, fmt.Errorf("invalid or expired refresh token: %w", err)
    }

    // 2. Extract claims from the decrypted PASETO — no Redis lookup needed for data
    userID, _ := token.GetSubject()
    tenantID, _ := token.GetString("tenant_id")
    familyID, _ := token.GetString("family")
    tokenJTI, _ := token.GetJti()
    var scopes []string
    token.Get("scopes", &scopes)

    // 3. Check if this specific JTI was already revoked (deny-list)
    if revoked, _ := s.redis.Exists(ctx, fmt.Sprintf("revoked:%s", tokenJTI)).Result(); revoked > 0 {
        return nil, fmt.Errorf("refresh token has been revoked")
    }

    // 4. Check for token family reuse (replay detection)
    //    Redis stores the latest valid JTI for each family.
    //    If the presented JTI doesn't match the latest → stolen token replay.
    familyKey := fmt.Sprintf("refresh_family:%s", familyID)
    latestJTI, err := s.redis.Get(ctx, familyKey).Result()
    if err != nil {
        return nil, fmt.Errorf("unknown token family — possible replay")
    }

    if latestJTI != tokenJTI {
        // This token was already rotated — someone is replaying the old one!
        // Revoke the entire family: add all known JTIs to the deny-list
        s.revokeTokenFamily(familyID)
        s.auditLog.Record(AuditEvent{
            Action: "token.replay_detected",
            Metadata: map[string]interface{}{
                "family_id":    familyID,
                "expected_jti": latestJTI,
                "received_jti": tokenJTI,
                "user_id":      userID,
            },
        })
        return nil, fmt.Errorf("refresh token reuse detected — all tokens in family revoked")
    }

    // 5. Revoke the old refresh token (add to deny-list with TTL)
    exp, _ := token.GetExpiration()
    remaining := time.Until(exp)
    if remaining > 0 {
        s.redis.Set(ctx, fmt.Sprintf("revoked:%s", tokenJTI), "1", remaining)
    }

    // 6. Load user and issue fresh token set (new refresh token with same family)
    user, _ := s.userRepo.FindByID(ctx, userID)
    tenant, _ := s.tenantRepo.FindByID(ctx, tenantID)

    // The new token set will have a new refresh token JTI but the SAME family ID
    // IssueTokens handles updating the family tracker in Redis
    return s.IssueTokens(user, tenant, scopes)
}

// PublicKeyForVerification returns the public key for external services
// to verify v4.public tokens (equivalent to JWKS endpoint)
func (s *TokenService) PublicKeyForVerification() paseto.V4AsymmetricPublicKey {
    return s.publicKey
}

// GetPublicKeyHex returns the public key as hex for the discovery endpoint
func (s *TokenService) GetPublicKeyHex() string {
    return s.publicKey.ExportHex()
}

func (s *TokenService) currentKeyID() string {
    // Rotate keys periodically; return current active key ID
    return "k4.pid.2026-Q2" // versioned key identifier
}

// ─── Supporting Types ───

type AccessTokenClaims struct {
    Subject   string
    TenantID  string
    Email     string
    Name      string
    TokenID   string
    Scopes    []string
}

type IDTokenClaims struct {
    Subject       string
    Email         string
    Name          string
    EmailVerified bool
}

// RefreshTokenData documents the claims inside a PASETO v4.local refresh token.
// This struct is NOT stored in Redis/DB — the data lives inside the encrypted PASETO.
// It exists here for documentation and for JSON marshaling in test fixtures.
type RefreshTokenClaims struct {
    Sub      string   // PASETO "sub" claim — TypeID: usr_01HZRTTG...
    TenantID string   // "tenant_id" claim — TypeID: ten_01HZRTTG...
    Scopes   []string // "scopes" claim
    Family   string   // "family" claim — crypto-random, for rotation detection
    JTI      string   // PASETO "jti" claim — crypto-random token ID
    // Exp, Iat, Iss are standard PASETO claims set automatically
}
```

### PASETO Key Distribution (Equivalent of JWKS)

Since PASETO doesn't use JWKS, you expose your public keys through a custom discovery endpoint:

```go
// sso-service/internal/handler/discovery.go

// GET /.well-known/paseto-keys — Public key discovery for v4.public tokens
func (h *DiscoveryHandler) PasetoKeys(c *fiber.Ctx) error {
    return c.JSON(fiber.Map{
        "keys": []fiber.Map{
            {
                "kid":     "k4.pid.2026-Q2",
                "version": "v4",
                "purpose": "public",
                "alg":     "Ed25519",  // Informational only — not negotiable
                "key":     h.tokenService.GetPublicKeyHex(),
                "exp":     "2026-09-01T00:00:00Z",  // Key expiration
            },
            // Previous key (kept for token verification during rotation)
            {
                "kid":     "k4.pid.2026-Q1",
                "version": "v4",
                "purpose": "public",
                "alg":     "Ed25519",
                "key":     h.previousPublicKeyHex,
                "exp":     "2026-06-01T00:00:00Z",
            },
        },
    })
}

// For OIDC-compatible clients that REQUIRE JWT, you also expose standard JWKS:
// GET /.well-known/jwks.json — Only for OIDC ID Token verification
func (h *DiscoveryHandler) JWKS(c *fiber.Ctx) error {
    // This endpoint only serves keys for the JWT-based OIDC ID tokens
    // Access tokens are PASETO and use the /paseto-keys endpoint
    return c.JSON(h.jwksKeySet)
}
```

---

## 5. Phase 2 — Core SSO & ReBAC

### Step 5: OpenFGA Authorization Model

This is the heart of your system. The model defines what types of entities exist and how relationships between them determine permissions.

```python
# openfga/model.fga
# OpenFGA DSL — Defines the authorization model

model
  schema 1.1

# === CORE TYPES ===

type user

type organization
  relations
    define owner: [user]
    define admin: [user] or owner
    define member: [user] or admin
    define billing_manager: [user]
    define can_manage_members: admin
    define can_manage_billing: billing_manager or admin
    define can_manage_apps: admin
    define can_view: member

type group
  relations
    define owner: [organization]
    define admin: [user]
    define member: [user, group#member]   # Groups can contain other groups!
    define can_manage: admin or owner_admin
    define owner_admin: admin from owner

type application
  relations
    define owner: [organization]
    define admin: [user, group#member]
    define editor: [user, group#member] or admin
    define viewer: [user, group#member] or editor or org_member
    define can_configure: admin
    define can_access: viewer
    define org_member: member from owner

# === RESOURCE TYPES (Google Drive-like) ===

type folder
  relations
    define owner: [user, organization]
    define editor: [user, group#member] or owner
    define viewer: [user, group#member] or editor
    define parent: [folder]
    define can_write: editor or can_write_parent
    define can_read: viewer or can_read_parent
    define can_write_parent: can_write from parent
    define can_read_parent: can_read from parent
    define can_share: owner
    define can_delete: owner

type document
  relations
    define owner: [user]
    define editor: [user, group#member] or owner
    define viewer: [user, group#member] or editor
    define commenter: [user, group#member]
    define parent_folder: [folder]
    define can_write: editor or folder_write
    define can_read: viewer or commenter or folder_read
    define can_comment: commenter or can_write
    define can_share: owner
    define can_delete: owner
    define folder_write: can_write from parent_folder
    define folder_read: can_read from parent_folder

# === API & SERVICE RESOURCES ===

type api_resource
  relations
    define owner: [application]
    define admin: [user, group#member]
    define reader: [user, group#member] or admin
    define writer: [user, group#member] or admin
    define can_read: reader or app_viewer
    define can_write: writer
    define can_admin: admin
    define app_viewer: viewer from owner

type feature_flag
  relations
    define owner: [organization]
    define enabled_for: [user, group#member, organization#member]
```

### Step 6: OpenFGA Integration Service

```go
// authz-service/internal/service/authz.go

package service

import (
    openfga "github.com/openfga/go-sdk"
    "github.com/openfga/go-sdk/client"
)

type AuthzService struct {
    fgaClient  *client.OpenFgaClient
    cache      *redis.Client
    auditLog   *AuditService
}

// WriteTuple creates a relationship in OpenFGA
func (s *AuthzService) WriteTuple(ctx context.Context, storeID string, tuple Tuple) error {
    body := client.ClientWriteRequest{
        Writes: []client.ClientTupleKey{
            {
                User:     tuple.User,
                Relation: tuple.Relation,
                Object:   tuple.Object,
            },
        },
    }

    _, err := s.fgaClient.Write(ctx).
        Options(client.ClientWriteOptions{StoreId: &storeID}).
        Body(body).
        Execute()

    if err != nil {
        return fmt.Errorf("openfga write failed: %w", err)
    }

    // Invalidate cache
    s.cache.Del(ctx, s.cacheKey(tuple.User, tuple.Relation, tuple.Object))

    // Audit log
    s.auditLog.Record(AuditEvent{
        Action:       "relationship.created",
        ResourceType: "tuple",
        Metadata: map[string]interface{}{
            "user":     tuple.User,
            "relation": tuple.Relation,
            "object":   tuple.Object,
        },
    })

    return nil
}

// Check verifies if a user has a specific relationship with an object
func (s *AuthzService) Check(ctx context.Context, storeID string, check CheckRequest) (bool, error) {
    // 1. Check cache first
    cacheKey := s.cacheKey(check.User, check.Relation, check.Object)
    cached, err := s.cache.Get(ctx, cacheKey).Result()
    if err == nil {
        return cached == "1", nil
    }

    // 2. Query OpenFGA
    body := client.ClientCheckRequest{
        User:     check.User,
        Relation: check.Relation,
        Object:   check.Object,
    }

    // Contextual tuples (temporary permissions for this check only)
    if len(check.ContextualTuples) > 0 {
        body.ContextualTuples = check.ContextualTuples
    }

    resp, err := s.fgaClient.Check(ctx).
        Options(client.ClientCheckOptions{StoreId: &storeID}).
        Body(body).
        Execute()

    if err != nil {
        return false, fmt.Errorf("openfga check failed: %w", err)
    }

    // 3. Cache result (short TTL: 30s for positive, 10s for negative)
    ttl := 10 * time.Second
    val := "0"
    if resp.GetAllowed() {
        ttl = 30 * time.Second
        val = "1"
    }
    s.cache.Set(ctx, cacheKey, val, ttl)

    return resp.GetAllowed(), nil
}

// ListObjects returns all objects a user has a specific relation with
func (s *AuthzService) ListObjects(ctx context.Context, storeID string, req ListObjectsRequest) ([]string, error) {
    body := client.ClientListObjectsRequest{
        User:     req.User,
        Relation: req.Relation,
        Type:     req.ObjectType,
    }

    resp, err := s.fgaClient.ListObjects(ctx).
        Options(client.ClientListObjectsOptions{StoreId: &storeID}).
        Body(body).
        Execute()

    if err != nil {
        return nil, err
    }

    return resp.GetObjects(), nil
}

// BatchCheck performs multiple permission checks in parallel
func (s *AuthzService) BatchCheck(ctx context.Context, storeID string, checks []CheckRequest) (map[string]bool, error) {
    results := make(map[string]bool)
    var mu sync.Mutex
    var wg sync.WaitGroup

    semaphore := make(chan struct{}, 10) // Max 10 concurrent checks

    for _, check := range checks {
        wg.Add(1)
        go func(c CheckRequest) {
            defer wg.Done()
            semaphore <- struct{}{}
            defer func() { <-semaphore }()

            allowed, err := s.Check(ctx, storeID, c)
            if err == nil {
                key := fmt.Sprintf("%s#%s@%s", c.Object, c.Relation, c.User)
                mu.Lock()
                results[key] = allowed
                mu.Unlock()
            }
        }(check)
    }

    wg.Wait()
    return results, nil
}
```

### Step 7: OIDC Provider (SSO Core)

```go
// sso-service/internal/oidc/provider.go

// Endpoints your OIDC provider must implement:
// GET  /.well-known/openid-configuration   → Discovery document
// GET  /oauth2/authorize                    → Authorization endpoint
// POST /oauth2/token                        → Token endpoint
// GET  /oauth2/userinfo                     → UserInfo endpoint
// GET  /.well-known/paseto-keys             → PASETO v4 public keys (replaces JWKS for PASETO tokens)
// GET  /.well-known/jwks.json               → JWKS (only for OIDC JWT ID Token compat)
// POST /oauth2/revoke                       → Token revocation
// POST /oauth2/introspect                   → Token introspection

type OIDCProvider struct {
    issuer       string
    tokenService *TokenService
    userService  *UserService
    clientRepo   *OAuthClientRepository
    consentRepo  *ConsentRepository
    authzService *AuthzService
}

// Authorization Endpoint - handles the login flow
func (p *OIDCProvider) Authorize(c *fiber.Ctx) error {
    // 1. Parse & validate request
    req := AuthorizeRequest{
        ClientID:     c.Query("client_id"),
        RedirectURI:  c.Query("redirect_uri"),
        ResponseType: c.Query("response_type"),
        Scope:        c.Query("scope"),
        State:        c.Query("state"),
        Nonce:        c.Query("nonce"),
        CodeChallenge: c.Query("code_challenge"),        // PKCE
        CodeChallengeMethod: c.Query("code_challenge_method"),
        LoginHint:    c.Query("login_hint"),
        Prompt:       c.Query("prompt"),
    }

    // 2. Validate client
    client, err := p.clientRepo.FindByClientID(ctx, req.ClientID)
    if err != nil {
        return c.Status(400).JSON(fiber.Map{"error": "invalid_client"})
    }

    // 3. Validate redirect URI
    if !contains(client.RedirectURIs, req.RedirectURI) {
        return c.Status(400).JSON(fiber.Map{"error": "invalid_redirect_uri"})
    }

    // 4. Check if user is already authenticated (SSO session)
    session, err := p.getActiveSession(c)
    if err != nil || req.Prompt == "login" {
        // Redirect to login page with return URL
        return c.Redirect(fmt.Sprintf(
            "/login?return_to=%s&client_id=%s&login_hint=%s",
            url.QueryEscape(c.OriginalURL()),
            req.ClientID,
            req.LoginHint,
        ))
    }

    // 5. Check consent (first-party apps skip this)
    if !client.IsFirstParty {
        consent, _ := p.consentRepo.Find(session.UserID, client.ID)
        if consent == nil || !consent.CoversScopes(req.Scope) {
            return c.Redirect(fmt.Sprintf(
                "/consent?client_id=%s&scope=%s&return_to=%s",
                req.ClientID, req.Scope, url.QueryEscape(c.OriginalURL()),
            ))
        }
    }

    // 6. Check ReBAC: does user have access to this application?
    allowed, _ := p.authzService.Check(ctx, client.Tenant.OpenFGAStoreID, CheckRequest{
        User:     fmt.Sprintf("user:%s", session.UserID),
        Relation: "can_access",
        Object:   fmt.Sprintf("application:%s", client.ID),
    })
    if !allowed {
        return c.Status(403).JSON(fiber.Map{
            "error": "access_denied",
            "error_description": "You don't have permission to access this application",
        })
    }

    // 7. Generate authorization code as a PASETO v4.local token (self-contained)
    // Instead of generating a random UUID and storing code data in Redis,
    // we encrypt ALL the code data INTO the token itself.
    // The auth code IS the data. No lookup needed at the token endpoint.
    authCodeToken := paseto.NewToken()
    authCodeToken.SetIssuedAt(time.Now())
    authCodeToken.SetExpiration(time.Now().Add(10 * time.Minute)) // Short-lived
    authCodeToken.SetIssuer(p.issuer)
    authCodeToken.SetJti(newTokenID())  // Crypto-random token ID
    authCodeToken.SetSubject(session.UserID)
    authCodeToken.SetString("client_id", client.ClientID)
    authCodeToken.SetString("tenant_id", client.TenantID)
    authCodeToken.SetString("scope", req.Scope)
    authCodeToken.SetString("nonce", req.Nonce)
    authCodeToken.SetString("code_challenge", req.CodeChallenge)
    authCodeToken.SetString("redirect_uri", req.RedirectURI)

    code := authCodeToken.V4Encrypt(p.authCodeKey, nil) // Dedicated key for auth codes

    // 8. Redirect back with code
    redirectURL := fmt.Sprintf("%s?code=%s&state=%s", req.RedirectURI, code, req.State)
    return c.Redirect(redirectURL)
}

// Discovery Document
func (p *OIDCProvider) Discovery(c *fiber.Ctx) error {
    return c.JSON(fiber.Map{
        "issuer":                 p.issuer,
        "authorization_endpoint": p.issuer + "/oauth2/authorize",
        "token_endpoint":         p.issuer + "/oauth2/token",
        "userinfo_endpoint":      p.issuer + "/oauth2/userinfo",
        "jwks_uri":               p.issuer + "/.well-known/jwks.json",       // OIDC compat (ID tokens only)
        "paseto_keys_uri":        p.issuer + "/.well-known/paseto-keys",     // PASETO public keys (access tokens)
        "revocation_endpoint":    p.issuer + "/oauth2/revoke",
        "introspection_endpoint": p.issuer + "/oauth2/introspect",
        "scopes_supported":       []string{"openid", "profile", "email", "groups", "permissions"},
        "response_types_supported": []string{"code"},
        "grant_types_supported":    []string{"authorization_code", "refresh_token", "client_credentials"},
        "token_endpoint_auth_methods_supported": []string{"client_secret_basic", "client_secret_post", "private_key_jwt"},
        "code_challenge_methods_supported": []string{"S256"},
        "access_token_format":    "paseto-v4-local",  // Non-standard: advertise PASETO usage
        "id_token_format":        "jwt",               // OIDC spec requires JWT
        "claims_supported": []string{"sub", "iss", "aud", "exp", "iat", "email", "name", "picture", "groups", "tenant_id"},
    })
}
```

### Step 8: SAML 2.0 Support (Enterprise SSO)

```go
// sso-service/internal/saml/handler.go

// Your system acts as BOTH:
// - SAML Service Provider (SP): Accepts logins from customer IdPs (Okta, Azure AD)
// - SAML Identity Provider (IdP): Provides SSO to customer apps

type SAMLHandler struct {
    spConfig   *saml.ServiceProvider
    idpConfig  *saml.IdentityProvider
    userService *UserService
    idpRepo    *IdentityProviderRepository
}

// ACS (Assertion Consumer Service) — receives SAML response from external IdP
func (h *SAMLHandler) ACS(c *fiber.Ctx) error {
    // 1. Parse SAML Response
    samlResponse := c.FormValue("SAMLResponse")
    relayState := c.FormValue("RelayState")

    // 2. Validate signature, conditions, timestamps
    assertion, err := h.spConfig.ParseResponse(samlResponse)
    if err != nil {
        return c.Status(400).JSON(fiber.Map{"error": "invalid SAML response"})
    }

    // 3. Extract user attributes from assertion
    attrs := extractAttributes(assertion)
    email := attrs["email"]
    name := attrs["displayName"]
    groups := attrs["groups"] // Group memberships from IdP

    // 4. Just-In-Time (JIT) provisioning
    user, err := h.userService.FindOrCreateByEmail(ctx, email, name)

    // 5. Sync group memberships from IdP to OpenFGA
    for _, group := range groups {
        h.authzService.WriteTuple(ctx, storeID, Tuple{
            User:     fmt.Sprintf("user:%s", user.ID),
            Relation: "member",
            Object:   fmt.Sprintf("group:%s", group),
        })
    }

    // 6. Create SSO session and redirect
    session, _ := h.sessionService.Create(ctx, user)
    return c.Redirect(relayState) // Back to the original app
}
```

---

## 6. Phase 3 — Advanced Features

### Step 9: SCIM 2.0 Provisioning

SCIM allows enterprise customers to automatically sync users and groups from their IdP (Okta, Azure AD) to your platform.

```go
// directory-service/internal/scim/handler.go

// SCIM Endpoints:
// GET    /scim/v2/Users              → List users
// GET    /scim/v2/Users/:id          → Get user
// POST   /scim/v2/Users              → Create user (provision)
// PUT    /scim/v2/Users/:id          → Replace user
// PATCH  /scim/v2/Users/:id          → Update user
// DELETE /scim/v2/Users/:id          → Deprovision user
// GET    /scim/v2/Groups             → List groups
// POST   /scim/v2/Groups             → Create group
// PATCH  /scim/v2/Groups/:id         → Update group membership

func (h *SCIMHandler) CreateUser(c *fiber.Ctx) error {
    tenantID := c.Locals("tenant_id").(string) // From SCIM bearer token

    var scimUser SCIMUser
    if err := c.BodyParser(&scimUser); err != nil {
        return scimError(c, 400, "invalidValue", "Invalid user payload")
    }

    // Create user in your system
    user, err := h.userService.Create(ctx, &User{
        Email:       scimUser.Emails.Primary(),
        DisplayName: scimUser.DisplayName,
        Status:      mapSCIMStatus(scimUser.Active),
    })

    // Create membership + OpenFGA tuples
    h.membershipService.Create(ctx, user.ID, tenantID, "member")
    h.authzService.WriteTuple(ctx, storeID, Tuple{
        User:     fmt.Sprintf("user:%s", user.ID),
        Relation: "member",
        Object:   fmt.Sprintf("organization:%s", tenantID),
    })

    // Return SCIM response
    return c.Status(201).JSON(toSCIMUser(user))
}

// When a user is deprovisioned via SCIM
func (h *SCIMHandler) DeleteUser(c *fiber.Ctx) error {
    userID := c.Params("id")
    tenantID := c.Locals("tenant_id").(string)

    // Soft-delete: deactivate, don't destroy
    h.userService.Deactivate(ctx, userID)

    // Remove all OpenFGA tuples for this user in this tenant
    h.authzService.DeleteUserTuples(ctx, storeID, fmt.Sprintf("user:%s", userID))

    // Revoke all active sessions
    h.sessionService.RevokeAllForUser(ctx, userID)

    return c.SendStatus(204)
}
```

### Step 10: Multi-Factor Authentication (MFA)

```go
// identity-service/internal/service/mfa.go

type MFAService struct {
    totpIssuer  string
    vault       *VaultClient          // For encrypting secrets
    challengeKey paseto.V4SymmetricKey // PASETO key for MFA challenge tokens
}

// CreateChallengeToken generates a PASETO v4.local MFA challenge token
// Instead of storing challenge data in Redis and returning a UUID reference,
// the challenge data is encrypted INSIDE the token. Zero database lookup.
func (s *MFAService) CreateChallengeToken(userID string, methods []string) string {
    token := paseto.NewToken()
    token.SetIssuedAt(time.Now())
    token.SetExpiration(time.Now().Add(5 * time.Minute)) // Challenge expires in 5 min
    token.SetJti(newTokenID())                            // Crypto-random, not UUID
    token.SetSubject(userID)                              // TypeID: usr_01HZRTTG...
    token.Set("methods", methods)                         // ["totp", "webauthn"]
    token.SetString("purpose", "mfa_challenge")           // Prevents token confusion

    return token.V4Encrypt(s.challengeKey, nil)
    // Returns: v4.local.<encrypted_challenge_data>
    // Client sends this back with the TOTP code → server decrypts to verify
}

// VerifyMFAChallenge decrypts the challenge token and validates the TOTP code
func (s *MFAService) VerifyMFAChallenge(ctx context.Context, challengeToken, totpCode string) (*MFAResult, error) {
    // 1. Decrypt the challenge token (PASETO handles expiry check automatically)
    parser := paseto.NewParser()
    parser.AddRule(paseto.NotExpired())

    token, err := parser.ParseV4Local(s.challengeKey, challengeToken, nil)
    if err != nil {
        return nil, fmt.Errorf("invalid or expired MFA challenge: %w", err)
    }

    // 2. Verify it's actually an MFA challenge (not some other token)
    purpose, _ := token.GetString("purpose")
    if purpose != "mfa_challenge" {
        return nil, fmt.Errorf("invalid token purpose")
    }

    // 3. Extract user ID from the decrypted challenge
    userID, _ := token.GetSubject()

    // 4. Verify the TOTP code
    valid, err := s.VerifyTOTP(ctx, userID, totpCode)
    if err != nil || !valid {
        return nil, fmt.Errorf("invalid TOTP code")
    }

    return &MFAResult{
        UserID:   userID,
        Verified: true,
    }, nil
}

type MFAResult struct {
    UserID   string
    Verified bool
}

// Enroll TOTP (Google Authenticator, Authy, etc.)
func (s *MFAService) EnrollTOTP(ctx context.Context, userID string) (*TOTPEnrollment, error) {
    // Generate secret
    key, err := totp.Generate(totp.GenerateOpts{
        Issuer:      s.totpIssuer,
        AccountName: user.Email,
        SecretSize:  32,
        Algorithm:   otp.AlgorithmSHA256,
    })

    // Encrypt and store (don't store plaintext!)
    encryptedSecret, _ := s.vault.Encrypt(key.Secret())

    return &TOTPEnrollment{
        Secret:    key.Secret(),              // Show once to user
        QRCode:    key.Image(200, 200),       // QR code for authenticator app
        BackupCodes: generateBackupCodes(10), // One-time use recovery codes
    }, nil
}

// Verify TOTP code
func (s *MFAService) VerifyTOTP(ctx context.Context, userID, code string) (bool, error) {
    secret, _ := s.getUserSecret(ctx, userID)
    decrypted, _ := s.vault.Decrypt(secret)

    valid := totp.Validate(code, decrypted)

    // Prevent replay: store used codes briefly
    if valid {
        key := fmt.Sprintf("totp_used:%s:%s", userID, code)
        s.redis.Set(ctx, key, "1", 90*time.Second)
    }

    return valid, nil
}

// WebAuthn/Passkey support (FIDO2)
func (s *MFAService) BeginWebAuthnRegistration(ctx context.Context, user *User) (*protocol.CredentialCreation, error) {
    webauthnUser := NewWebAuthnUser(user)
    options, session, err := s.webauthn.BeginRegistration(webauthnUser)
    // Store session for completion
    s.redis.Set(ctx, fmt.Sprintf("webauthn_reg:%s", user.ID), session, 5*time.Minute)
    return options, err
}
```

### Step 11: Organization-Level Policies

```go
// tenant-service/internal/service/policy.go

type TenantPolicy struct {
    TenantID           string
    PasswordMinLength  int      `json:"password_min_length"`      // Default: 12
    PasswordRequireMFA bool     `json:"password_require_mfa"`     // Force MFA for all users
    AllowedMFAMethods  []string `json:"allowed_mfa_methods"`      // ["totp", "webauthn", "sms"]
    SessionMaxAge      int      `json:"session_max_age_hours"`    // Max session duration
    IdleTimeout        int      `json:"idle_timeout_minutes"`     // Inactivity timeout
    IPAllowlist        []string `json:"ip_allowlist"`             // Restrict login to IPs/CIDRs
    AllowedDomains     []string `json:"allowed_email_domains"`    // Only @company.com can join
    RequireSSO         bool     `json:"require_sso"`              // Disable password login
    DataResidency      string   `json:"data_residency"`           // "us", "eu", "ap"
}

// Enforce policies as middleware
func PolicyEnforcement(policyService *PolicyService) fiber.Handler {
    return func(c *fiber.Ctx) error {
        tenantID := c.Locals("tenant_id").(string)
        policy, _ := policyService.Get(ctx, tenantID)

        // IP allowlist check
        if len(policy.IPAllowlist) > 0 && !isIPAllowed(c.IP(), policy.IPAllowlist) {
            return c.Status(403).JSON(fiber.Map{"error": "ip_not_allowed"})
        }

        // Session age check
        session := c.Locals("session").(*Session)
        maxAge := time.Duration(policy.SessionMaxAge) * time.Hour
        if time.Since(session.CreatedAt) > maxAge {
            return c.Status(401).JSON(fiber.Map{"error": "session_expired"})
        }

        // MFA enforcement
        if policy.PasswordRequireMFA && !session.MFAVerified {
            return c.Status(403).JSON(fiber.Map{
                "error": "mfa_required",
                "message": "Your organization requires multi-factor authentication",
            })
        }

        return c.Next()
    }
}
```

### Step 12: Webhook System

```go
// webhook-service/internal/service/webhook.go

// Events that trigger webhooks:
// user.created, user.updated, user.deleted, user.login, user.mfa_enrolled
// membership.created, membership.deleted
// group.created, group.updated, group.member_added, group.member_removed
// permission.granted, permission.revoked
// session.created, session.revoked

type WebhookDelivery struct {
    ID          string
    EndpointURL string
    Event       string
    Payload     map[string]interface{}
    Signature   string    // HMAC-SHA256 of payload
    Attempt     int
    MaxRetries  int       // Default: 5
    NextRetry   time.Time // Exponential backoff
}

func (s *WebhookService) Deliver(ctx context.Context, event WebhookEvent) error {
    endpoints, _ := s.repo.FindByTenantAndEvent(ctx, event.TenantID, event.Type)

    for _, endpoint := range endpoints {
        payload := map[string]interface{}{
            "id":         id.NewWebhookEventID(), // TypeID: evt_01HZRTTG... (sortable, typed)
            "type":       event.Type,
            "timestamp":  time.Now().UTC().Format(time.RFC3339),
            "tenant_id":  event.TenantID,         // TypeID: ten_01HZRTTG...
            "data":       event.Data,
        }

        // Sign payload with endpoint's secret
        signature := computeHMAC(payload, endpoint.Secret)

        // Queue for delivery with retry logic
        s.queue.Enqueue(WebhookDelivery{
            EndpointURL: endpoint.URL,
            Payload:     payload,
            Signature:   signature,
            MaxRetries:  5,
        })
    }

    return nil
}
```

---

## 7. Phase 4 — Scalability & Production Hardening

### Step 13: Caching Strategy

```
┌─────────────────────────────────────────────────────────┐
│                    Caching Layers                        │
│                                                         │
│  L1: In-Process Cache (Ristretto)                       │
│      • OpenFGA check results (5s TTL)                   │
│      • PASETO public keys + JWKS (5min TTL)             │
│      • Tenant config/policies (30s TTL)                 │
│                                                         │
│  L2: Redis Cluster                                      │
│      • Token deny-list (revoked JTIs, auto-expiring)    │  ← NEW: replaces session store
│      • Refresh token family tracker (rotation detect)   │  ← NEW: replaces refresh token store
│      • Auth code single-use tracker (10min TTL)         │  ← NEW: replaces auth code store
│      • OpenFGA check results (30s TTL)                  │
│      • Rate limiting counters                           │
│      • SCIM sync state                                  │
│                                                         │
│  L3: PostgreSQL                                         │
│      • Source of truth for all entities (TypeID PKs)    │
│      • OpenFGA store (separate Postgres instance)       │
│                                                         │
│  KEY SHIFT: Redis usage dropped ~70%                    │
│      Before: Redis stored full session/token data       │
│      After:  Data lives INSIDE PASETO tokens            │
│              Redis only tracks deny-lists + families    │
│              (tiny keys, auto-expire, minimal memory)   │
│                                                         │
│  Cache Invalidation:                                    │
│      • Event-driven via NATS/Kafka                      │
│      • Tuple write → invalidate related check caches    │
│      • User update → tokens self-expire (15min)         │
│      • Policy update → invalidate policy caches         │
└─────────────────────────────────────────────────────────┘
```

### Step 14: Horizontal Scaling Architecture

```
                    DNS (Route 53 / Cloudflare)
                           │
                    ┌──────▼──────┐
                    │   CDN Edge   │  ← Angular bundles, PASETO/JWKS keys, discovery docs
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  L7 Load    │  ← Health checks, TLS termination
                    │  Balancer   │
                    └──────┬──────┘
                           │
       ┌───────────────────┼───────────────────┐
       │    Go (hot path)  │  NestJS (platform) │
       │                   │                    │
  ┌────▼────┐ ┌────▼────┐ ┌────▼────┐ ┌────▼──────┐
  │identity │ │ authz   │ │  sso    │ │ admin-api │   ← Go: 5-20 replicas (HPA on RPS)
  │ (x5)   │ │ (x10)   │ │  (x5)   │ │ webhook   │      NestJS: 3-10 replicas (HPA on CPU)
  │  Go     │ │  Go     │ │  Go     │ │ directory │
  └────┬────┘ └────┬────┘ └────┬────┘ │ audit     │
       │           │           │      │  NestJS   │
       │           │           │      └────┬──────┘
       │           │           │           │
  ┌────▼───────────▼───────────▼───────────▼─────┐
  │           Service Mesh                        │
  │         (Istio / Linkerd)                    │
  │    mTLS, circuit breaking,                   │
  │    retry, load balancing                     │
  │    Go ↔ NestJS via gRPC (protobuf)           │
  └────┬───────────┬──────────────────┘
       │           │
  ┌────▼──────┐  ┌─▼───────────────┐
  │ Redis     │  │ PostgreSQL       │
  │ Cluster   │  │ (Primary + 3    │
  │ (6 nodes) │  │  Read Replicas)  │
  └───────────┘  └─────────────────┘
       │
  ┌────▼─────────────────┐
  │  OpenFGA Cluster      │
  │  (3-5 instances)      │
  │  + own Postgres       │
  └──────────────────────┘
```

### Step 15: Database Scaling

```sql
-- Read/Write splitting
-- Writes → Primary
-- Reads  → Read Replicas (for non-critical reads like audit logs, search)

-- Connection pooling: Use PgBouncer (transaction mode)
-- Config: max_client_conn = 10000, default_pool_size = 50

-- Partitioning for audit logs (already shown above)
-- Partitioning for sessions by tenant for large deployments:

-- Table sharding strategy for 10M+ users:
-- Option A: Postgres partitioning by tenant_id hash
-- Option B: Citus extension for distributed PostgreSQL
-- Option C: Separate database per large enterprise tenant

-- OpenFGA scaling:
-- OpenFGA supports horizontal read replicas
-- Each tenant gets their own OpenFGA "store" (logical isolation)
-- For very large tenants, dedicated OpenFGA instances
```

### Step 16: Rate Limiting

```go
// middleware/ratelimit.go

// Tiered rate limiting strategy:
// 1. Global: 10,000 req/s across all services
// 2. Per-tenant: Based on plan (Free: 100/min, Pro: 1000/min, Enterprise: 10000/min)
// 3. Per-user: 60 req/min for auth endpoints
// 4. Per-IP: 20 req/min for login attempts (brute force protection)

type RateLimiter struct {
    redis *redis.Client
}

func (rl *RateLimiter) CheckLimit(ctx context.Context, key string, limit int, window time.Duration) (bool, int, error) {
    // Sliding window using Redis sorted sets
    now := time.Now().UnixMilli()
    windowStart := now - window.Milliseconds()

    pipe := rl.redis.Pipeline()
    pipe.ZRemRangeByScore(ctx, key, "0", fmt.Sprintf("%d", windowStart))
    pipe.ZAdd(ctx, key, redis.Z{Score: float64(now), Member: fmt.Sprintf("%d", now)})
    pipe.ZCard(ctx, key)
    pipe.Expire(ctx, key, window)

    results, err := pipe.Exec(ctx)
    if err != nil {
        return true, limit, err // Fail open
    }

    count := results[2].(*redis.IntCmd).Val()
    remaining := limit - int(count)

    return count <= int64(limit), remaining, nil
}
```

---

## 8. OpenFGA Deep Dive

### Real-World Authorization Scenarios

```python
# ══════════════════════════════════════════════════════════════════
# Note: In these examples, human-readable names are used for clarity.
# In production, OpenFGA tuples use TypeIDs:
#   user:usr_01HZR...  (not user:alice)
#   organization:ten_01HZR...  (not organization:acme)
#   folder:fld_01HZR...  (not folder:project-x)
# TypeIDs make debugging OpenFGA tuples much easier than UUIDs:
#   user:usr_01HZRTTG1NQJ  vs  user:550e8400-e29b-41d4-a716-446655440000
# ══════════════════════════════════════════════════════════════════

# Scenario 1: Google Drive-like sharing
# "Alice shares a folder with the Engineering team,
#  Bob is in Engineering, so Bob can read all documents in that folder"

# Tuples (production format with TypeIDs):
user:usr_01HZR_alice     → owner    → folder:fld_01HZR_projx
group:grp_01HZR_eng      → viewer   → folder:fld_01HZR_projx
user:usr_01HZR_bob       → member   → group:grp_01HZR_eng
document:doc_01HZR_spec  → parent_folder → folder:fld_01HZR_projx

# Check: Can Bob read spec.md?
# OpenFGA resolves: bob → member of engineering → viewer of folder:project-x
#                   → spec.md is in folder:project-x → bob can_read spec.md
# Result: ✅ ALLOWED

# ---

# Scenario 2: Application access control
# "Only the Sales team can access Salesforce, but admins can access everything"

organization:ten_01HZR_acme  → owner   → application:app_01HZR_sfdc
group:grp_01HZR_sales        → viewer  → application:app_01HZR_sfdc
user:usr_01HZR_carol         → member  → group:grp_01HZR_sales
user:usr_01HZR_dave          → admin   → organization:ten_01HZR_acme

# Check: Can Carol access Salesforce? ✅ (via sales-team membership)
# Check: Can Dave access Salesforce? ✅ (via admin → org_member → viewer)
# Check: Can Eve access Salesforce? ❌ (no relationship path)

# ---

# Scenario 3: Hierarchical folders
folder:fld_01HZR_root     → owner   → organization:ten_01HZR_acme
folder:fld_01HZR_eng      → parent  → folder:fld_01HZR_root
folder:fld_01HZR_frontend → parent  → folder:fld_01HZR_eng
document:doc_01HZR_readme → parent_folder → folder:fld_01HZR_frontend
user:usr_01HZR_frank      → editor  → folder:fld_01HZR_eng

# Frank can write to readme.md because:
# frank → editor of folder:engineering
# folder:frontend inherits from folder:engineering (parent)
# readme.md inherits from folder:frontend (parent_folder)
# Permission flows: frank → editor → can_write → propagates through hierarchy
```

### Model Migration Strategy

```go
// When you need to update the authorization model:

func (s *AuthzService) MigrateModel(ctx context.Context, storeID string, newModel string) error {
    // 1. Write new model version to OpenFGA
    resp, err := s.fgaClient.WriteAuthorizationModel(ctx).
        Options(client.ClientWriteAuthorizationModelOptions{StoreId: &storeID}).
        Body(newModel).
        Execute()

    newModelID := resp.GetAuthorizationModelId()

    // 2. Run validation checks against new model
    testCases := s.getModelTestCases()
    for _, tc := range testCases {
        result, _ := s.fgaClient.Check(ctx).
            Options(client.ClientCheckOptions{
                StoreId: &storeID,
                AuthorizationModelId: &newModelID,
            }).
            Body(tc.Request).
            Execute()

        if result.GetAllowed() != tc.Expected {
            return fmt.Errorf("model migration validation failed for: %s", tc.Name)
        }
    }

    // 3. Gradually roll out new model (canary)
    // Use feature flags to route % of checks to new model

    // 4. Set as default model for the store
    s.updateDefaultModel(ctx, storeID, newModelID)

    return nil
}
```

---

## 9. API Design

### Public API (for customers integrating your SSO)

```yaml
# Core Authentication APIs
POST   /api/v1/auth/register           # Register new user
POST   /api/v1/auth/login              # Login (email/password)
POST   /api/v1/auth/login/sso          # Initiate SSO login
POST   /api/v1/auth/mfa/verify         # Verify MFA code
POST   /api/v1/auth/token/refresh      # Refresh access token
POST   /api/v1/auth/logout             # Logout (revoke session)
POST   /api/v1/auth/password/reset     # Request password reset
POST   /api/v1/auth/password/change    # Change password

# OIDC Standard Endpoints + PASETO Discovery
GET    /.well-known/openid-configuration
GET    /.well-known/paseto-keys           # PASETO v4 Ed25519 public keys
GET    /.well-known/jwks.json             # JWT keys (OIDC compat only)
GET    /oauth2/authorize
POST   /oauth2/token
GET    /oauth2/userinfo
POST   /oauth2/revoke
POST   /oauth2/introspect

# User Management
GET    /api/v1/users                   # List users (paginated)
GET    /api/v1/users/:id               # Get user
PATCH  /api/v1/users/:id               # Update user
DELETE /api/v1/users/:id               # Deactivate user

# Organization / Tenant
GET    /api/v1/orgs                    # List user's organizations
POST   /api/v1/orgs                    # Create organization
GET    /api/v1/orgs/:id                # Get organization
PATCH  /api/v1/orgs/:id                # Update organization
GET    /api/v1/orgs/:id/members        # List members
POST   /api/v1/orgs/:id/members        # Add member
DELETE /api/v1/orgs/:id/members/:uid   # Remove member

# Groups
GET    /api/v1/orgs/:id/groups         # List groups
POST   /api/v1/orgs/:id/groups         # Create group
PATCH  /api/v1/groups/:id              # Update group
POST   /api/v1/groups/:id/members      # Add member
DELETE /api/v1/groups/:id/members/:uid # Remove member

# Authorization (ReBAC)
POST   /api/v1/authz/check             # Check permission
POST   /api/v1/authz/batch-check       # Batch permission check
POST   /api/v1/authz/list-objects      # List accessible objects
POST   /api/v1/authz/list-relations    # List user's relations to object
POST   /api/v1/authz/tuples            # Write relationship tuple
DELETE /api/v1/authz/tuples            # Delete relationship tuple
GET    /api/v1/authz/model             # Get current auth model

# Applications (OAuth Clients)
GET    /api/v1/orgs/:id/apps           # List applications
POST   /api/v1/orgs/:id/apps           # Register application
PATCH  /api/v1/apps/:id                # Update application
DELETE /api/v1/apps/:id                # Delete application

# Identity Providers
GET    /api/v1/orgs/:id/idps           # List IdP connections
POST   /api/v1/orgs/:id/idps           # Configure new IdP (SAML/OIDC)
PATCH  /api/v1/idps/:id                # Update IdP config
DELETE /api/v1/idps/:id                # Remove IdP

# SCIM 2.0 (for enterprise provisioning)
GET    /scim/v2/Users
POST   /scim/v2/Users
GET    /scim/v2/Users/:id
PUT    /scim/v2/Users/:id
PATCH  /scim/v2/Users/:id
DELETE /scim/v2/Users/:id
GET    /scim/v2/Groups
POST   /scim/v2/Groups
PATCH  /scim/v2/Groups/:id

# Audit Logs
GET    /api/v1/orgs/:id/audit-logs     # Query audit logs

# Webhooks
GET    /api/v1/orgs/:id/webhooks       # List webhook endpoints
POST   /api/v1/orgs/:id/webhooks       # Create webhook endpoint
PATCH  /api/v1/webhooks/:id            # Update webhook
DELETE /api/v1/webhooks/:id            # Delete webhook
```

### PASETO-Specific Endpoints (in addition to OIDC)

```yaml
# PASETO Key Discovery
GET    /.well-known/paseto-keys          # Ed25519 public keys for v4.public verification

# Token Operations
POST   /oauth2/token                      # Issues PASETO v4.local access + v4.public ID tokens
POST   /oauth2/introspect                 # Decrypts & inspects PASETO v4.local tokens (server-side only)
POST   /oauth2/revoke                     # Revokes tokens (adds JTI to deny-list)
```

### Step A: OAuth2 Token Endpoint (Issues PASETO)

This is the endpoint that exchanges authorization codes for PASETO tokens:

```go
// sso-service/internal/oidc/token.go

func (p *OIDCProvider) Token(c *fiber.Ctx) error {
    grantType := c.FormValue("grant_type")

    switch grantType {
    case "authorization_code":
        return p.handleAuthCodeExchange(c)
    case "refresh_token":
        return p.handleRefreshTokenGrant(c)
    case "client_credentials":
        return p.handleClientCredentialsGrant(c)
    default:
        return c.Status(400).JSON(fiber.Map{
            "error":             "unsupported_grant_type",
            "error_description": "supported: authorization_code, refresh_token, client_credentials",
        })
    }
}

func (p *OIDCProvider) handleAuthCodeExchange(c *fiber.Ctx) error {
    // 1. Authenticate the client (client_secret_basic or client_secret_post)
    client, err := p.authenticateClient(c)
    if err != nil {
        return c.Status(401).JSON(fiber.Map{"error": "invalid_client"})
    }

    code := c.FormValue("code")
    redirectURI := c.FormValue("redirect_uri")
    codeVerifier := c.FormValue("code_verifier")  // PKCE

    // 2. Decrypt the authorization code — it's a PASETO v4.local token (self-contained)
    //    All code data is encrypted INSIDE the token. No Redis/DB lookup needed.
    //    If expired, tampered, or wrong key → instant reject.
    codeParser := paseto.NewParser()
    codeParser.AddRule(paseto.NotExpired())
    codeParser.AddRule(paseto.IssuedBy(p.issuer))

    authCode, err := codeParser.ParseV4Local(p.authCodeKey, code, nil)
    if err != nil {
        return c.Status(400).JSON(fiber.Map{"error": "invalid_grant", "error_description": "invalid or expired authorization code"})
    }

    // 3. Check single-use: add the code's JTI to a deny-list
    //    If we've seen this JTI before, the code was already exchanged → reject
    codeJTI, _ := authCode.GetJti()
    alreadyUsed, _ := p.redis.SetNX(ctx, fmt.Sprintf("used_code:%s", codeJTI), "1", 15*time.Minute).Result()
    if !alreadyUsed {
        return c.Status(400).JSON(fiber.Map{"error": "invalid_grant", "error_description": "authorization code already used"})
    }

    // 4. Extract claims from the decrypted PASETO auth code
    codeClientID, _ := authCode.GetString("client_id")
    codeTenantID, _ := authCode.GetString("tenant_id")
    codeScope, _ := authCode.GetString("scope")
    codeNonce, _ := authCode.GetString("nonce")
    codeChallenge, _ := authCode.GetString("code_challenge")
    codeRedirectURI, _ := authCode.GetString("redirect_uri")
    userID, _ := authCode.GetSubject()

    // 5. Validate client matches
    if codeClientID != client.ClientID {
        return c.Status(400).JSON(fiber.Map{"error": "invalid_grant"})
    }

    // 6. Validate PKCE challenge
    if codeChallenge != "" {
        expected := base64URLEncode(sha256Sum(codeVerifier))
        if !constantTimeCompare(expected, codeChallenge) {
            return c.Status(400).JSON(fiber.Map{"error": "invalid_grant", "error_description": "PKCE verification failed"})
        }
    }

    // 7. Validate redirect URI matches
    if redirectURI != codeRedirectURI {
        return c.Status(400).JSON(fiber.Map{"error": "invalid_grant"})
    }

    // 8. Load user and tenant using TypeIDs from the decrypted code
    user, _ := p.userService.FindByID(ctx, userID)           // usr_01HZRTTG...
    tenant, _ := p.tenantService.FindByID(ctx, codeTenantID) // ten_01HZRTTG...

    // 9. Issue PASETO tokens
    tokens, err := p.tokenService.IssueTokens(user, tenant, strings.Split(codeScope, " "))
    if err != nil {
        return c.Status(500).JSON(fiber.Map{"error": "server_error"})
    }

    // 10. Audit log
    p.auditLog.Record(AuditEvent{
        TenantID: tenant.ID,
        ActorID:  user.ID,
        Action:   "token.issued",
        Metadata: map[string]interface{}{
            "grant_type": "authorization_code",
            "client_id":  client.ClientID,
            "scopes":     codeScope,
            "token_type": "paseto-v4",
        },
    })

    // 11. Response — all tokens are PASETO v4
    return c.JSON(fiber.Map{
        "access_token":  tokens.AccessToken,   // v4.local.<encrypted>.<footer>
        "token_type":    "Bearer",
        "expires_in":    tokens.ExpiresIn,      // 900 (15 minutes)
        "refresh_token": tokens.RefreshToken,   // v4.local.<encrypted> (self-contained, NOT opaque)
        "id_token":      tokens.IDToken,        // v4.public.<signed>.<footer>
        "scope":         codeScope,
    })
}

func (p *OIDCProvider) handleRefreshTokenGrant(c *fiber.Ctx) error {
    client, err := p.authenticateClient(c)
    if err != nil {
        return c.Status(401).JSON(fiber.Map{"error": "invalid_client"})
    }

    refreshTokenStr := c.FormValue("refresh_token")

    // The refresh token is a PASETO v4.local — self-contained, encrypted.
    // tokenService.RefreshAccessToken will:
    //   1. Decrypt the PASETO to extract claims (no Redis lookup for data)
    //   2. Check the JTI against the deny-list in Redis
    //   3. Verify token family for replay detection
    //   4. Revoke the old token and issue a fresh token set
    tokens, err := p.tokenService.RefreshAccessToken(refreshTokenStr)
    if err != nil {
        p.auditLog.Record(AuditEvent{
            Action: "token.refresh_failed",
            Metadata: map[string]interface{}{
                "error":     err.Error(),
                "client_id": client.ClientID,
            },
        })
        return c.Status(400).JSON(fiber.Map{
            "error":             "invalid_grant",
            "error_description": err.Error(),
        })
    }

    return c.JSON(fiber.Map{
        "access_token":  tokens.AccessToken,   // Fresh v4.local
        "token_type":    "Bearer",
        "expires_in":    tokens.ExpiresIn,
        "refresh_token": tokens.RefreshToken,  // Fresh v4.local (rotated)
    })
}
```

### Step B: PASETO Token Introspection

Since `v4.local` tokens are **encrypted**, only your authorization server can inspect them. Third-party resource servers must call this endpoint to validate access tokens they can't decrypt themselves:

```go
// sso-service/internal/oidc/introspect.go

// POST /oauth2/introspect
// This is critical for PASETO because v4.local tokens are opaque to resource servers
// that don't hold the symmetric key. They MUST introspect to validate.
//
// Two strategies:
// 1. Share the v4.local symmetric key with your own resource servers (fast, no network call)
// 2. Resource servers call introspect endpoint (standard, works for third-party apps)

func (p *OIDCProvider) Introspect(c *fiber.Ctx) error {
    // 1. Authenticate the calling client (must be a registered resource server)
    client, err := p.authenticateClient(c)
    if err != nil {
        return c.Status(401).JSON(fiber.Map{"error": "invalid_client"})
    }

    tokenStr := c.FormValue("token")
    tokenTypeHint := c.FormValue("token_type_hint") // "access_token" or "refresh_token"

    // 2. Check if token is on the deny-list (revoked)
    jti := extractJTIFromPASETO(p.tokenService, tokenStr)
    if jti != "" {
        revoked, _ := p.redis.Exists(ctx, fmt.Sprintf("revoked:%s", jti)).Result()
        if revoked > 0 {
            return c.JSON(fiber.Map{"active": false})
        }
    }

    // 3. Attempt to decrypt/verify the PASETO
    var claims map[string]interface{}
    var active bool

    if strings.HasPrefix(tokenStr, "v4.local.") {
        // Encrypted access token — decrypt with symmetric key
        token, err := p.tokenService.VerifyAccessToken(tokenStr)
        if err != nil {
            return c.JSON(fiber.Map{"active": false}) // Expired, invalid, or tampered
        }

        sub, _ := token.GetSubject()
        iss, _ := token.GetIssuer()
        aud, _ := token.GetAudience()
        exp, _ := token.GetExpiration()
        iat, _ := token.GetIssuedAt()
        email, _ := token.GetString("email")
        tenantID, _ := token.GetString("tenant_id")
        scopes, _ := token.GetString("scopes")

        claims = map[string]interface{}{
            "active":    true,
            "sub":       sub,
            "iss":       iss,
            "aud":       aud,
            "exp":       exp.Unix(),
            "iat":       iat.Unix(),
            "email":     email,
            "tenant_id": tenantID,
            "scope":     scopes,
            "token_type": "paseto-v4-local",
            "client_id": client.ClientID,
        }
        active = true

    } else if strings.HasPrefix(tokenStr, "v4.public.") {
        // Signed ID token — verify with public key
        token, err := p.tokenService.VerifyIDToken(tokenStr)
        if err != nil {
            return c.JSON(fiber.Map{"active": false})
        }

        sub, _ := token.GetSubject()
        exp, _ := token.GetExpiration()

        claims = map[string]interface{}{
            "active":     true,
            "sub":        sub,
            "exp":        exp.Unix(),
            "token_type": "paseto-v4-public",
        }
        active = true
    } else {
        return c.JSON(fiber.Map{"active": false})
    }

    if !active {
        return c.JSON(fiber.Map{"active": false})
    }

    return c.JSON(claims)
}

// extractJTIFromPASETO attempts to get the token ID without full validation
// Used for quick revocation checks before expensive decrypt
func extractJTIFromPASETO(ts *TokenService, tokenStr string) string {
    token, err := ts.VerifyAccessToken(tokenStr)
    if err != nil {
        return ""
    }
    jti, _ := token.GetJti()
    return jti
}
```

### Step C: PASETO Token Revocation

PASETO tokens are stateless, so revocation requires a deny-list. Since tokens are short-lived (15 min), the deny-list stays small:

```go
// sso-service/internal/oidc/revoke.go

// POST /oauth2/revoke
func (p *OIDCProvider) Revoke(c *fiber.Ctx) error {
    client, err := p.authenticateClient(c)
    if err != nil {
        return c.Status(401).JSON(fiber.Map{"error": "invalid_client"})
    }

    tokenStr := c.FormValue("token")
    tokenTypeHint := c.FormValue("token_type_hint")

    switch {
    case strings.HasPrefix(tokenStr, "v4.local.") || strings.HasPrefix(tokenStr, "v4.public."):
        // ALL bearer tokens are now PASETO v4 — access, refresh, and ID tokens
        // Decrypt to get the JTI, then add to deny-list
        token, err := p.tokenService.VerifyAccessToken(tokenStr)
        if err != nil {
            // Token already expired or invalid — nothing to revoke
            return c.SendStatus(200)
        }

        jti, _ := token.GetJti()
        exp, _ := token.GetExpiration()

        if jti != "" {
            // Add to deny-list with TTL matching the token's remaining lifetime
            // Once the token would have expired naturally, the deny-list entry auto-cleans
            remaining := time.Until(exp)
            if remaining > 0 {
                p.redis.Set(ctx, fmt.Sprintf("revoked:%s", jti), "1", remaining)
            }
        }

        // If it's a refresh token, also revoke the entire token family
        familyID, err := token.GetString("family")
        if err == nil && familyID != "" {
            p.revokeTokenFamily(familyID)
        }

    default:
        // Unknown token format — ignore per RFC 7009
    }

    // RFC 7009: always return 200, even if token was already invalid
    return c.SendStatus(200)
}
```

### Step D: PASETO Implicit Assertions (v4 Feature)

Implicit assertions are a **PASETO v4-only** feature that binds tokens to a specific context without including that context in the token itself. Think of it as channel binding — the token is only valid when presented in the expected context:

```go
// Implicit assertions are extra data included in the authentication tag computation
// but NOT stored in the token. Both the creator and verifier must know the assertion.
//
// Use case: Bind a token to a specific tenant, so even if an attacker gets a valid
// token from Tenant A, they can't use it against Tenant B's API.

// When creating a PASETO, include the implicit assertion:
func (s *TokenService) IssueTokenWithBinding(user *User, tenant *Tenant, scopes []string) (string, error) {
    token := paseto.NewToken()
    token.SetIssuedAt(time.Now())
    token.SetExpiration(time.Now().Add(15 * time.Minute))
    token.SetIssuer(s.issuer)
    token.SetSubject(user.ID)

    // Custom claims
    token.SetString("tenant_id", tenant.ID)
    token.SetString("email", user.Email)

    // The implicit assertion: bind this token to the tenant's API endpoint
    // This data is NOT in the token but IS part of the cryptographic authentication
    implicitAssertion := []byte(fmt.Sprintf(`{"tenant":"%s","api":"%s"}`, tenant.ID, tenant.APIEndpoint))

    // Encrypt with implicit assertion
    encrypted := token.V4Encrypt(s.localKey, implicitAssertion)
    return encrypted, nil
}

// When verifying, the same implicit assertion must be provided:
func (s *TokenService) VerifyWithBinding(tokenStr string, tenantID string, apiEndpoint string) (*paseto.Token, error) {
    parser := paseto.NewParser()
    parser.AddRule(paseto.NotExpired())
    parser.AddRule(paseto.IssuedBy(s.issuer))

    // The EXACT same implicit assertion must be provided
    // If tenantID or apiEndpoint doesn't match what was used during creation,
    // decryption fails — the token is cryptographically bound to this context
    implicitAssertion := []byte(fmt.Sprintf(`{"tenant":"%s","api":"%s"}`, tenantID, apiEndpoint))

    token, err := parser.ParseV4Local(s.localKey, tokenStr, implicitAssertion)
    if err != nil {
        return nil, fmt.Errorf("token verification failed (binding mismatch or invalid): %w", err)
    }

    return token, nil
}

// Why this matters:
// 1. Stolen tokens can't be used cross-tenant (binding fails)
// 2. Tokens can be bound to specific API hosts (prevents token export)
// 3. Zero additional size cost (assertions aren't stored in the token)
// 4. JWT has NO equivalent feature — this is unique to PASETO v4
```

### Step E: Customer SDKs with PASETO

#### Node.js/TypeScript SDK

```typescript
// packages/sdk-node/src/client.ts

import { V4 } from "paseto"; // npm install paseto
import type { KeyObject } from "crypto";

interface SSOConfig {
	domain: string;
	clientId: string;
	clientSecret: string;
	// Optional: for v4.local token decryption (internal services only)
	symmetricKey?: Buffer;
}

export class SSOClient {
	private config: SSOConfig;
	private publicKey: KeyObject | null = null;
	private publicKeyFetchedAt: number = 0;

	constructor(config: SSOConfig) {
		this.config = config;
	}

	// ── Fetch PASETO public keys from discovery endpoint ──
	private async getPublicKey(): Promise<KeyObject> {
		// Cache for 5 minutes
		if (
			this.publicKey &&
			Date.now() - this.publicKeyFetchedAt < 5 * 60 * 1000
		) {
			return this.publicKey;
		}

		const res = await fetch(
			`https://${this.config.domain}/.well-known/paseto-keys`,
		);
		const keys = await res.json();

		// Find the current v4.public key
		const currentKey = keys.keys.find(
			(k: any) => k.version === "v4" && k.purpose === "public",
		);
		if (!currentKey) throw new Error("No v4.public key found");

		this.publicKey = await V4.bytesToKeyObject(
			Buffer.from(currentKey.public_key, "hex"),
		);
		this.publicKeyFetchedAt = Date.now();
		return this.publicKey;
	}

	// ── Verify v4.public tokens (signed, not encrypted) ──
	// Use this for ID tokens that your app receives from the SSO
	async verifyPublicToken(token: string): Promise<Record<string, unknown>> {
		const publicKey = await this.getPublicKey();

		const payload = await V4.verify(token, publicKey, {
			issuer: `https://${this.config.domain}`,
			audience: this.config.clientId,
			clockTolerance: "30s",
		});

		return payload;
	}

	// ── Decrypt v4.local tokens (encrypted, symmetric) ──
	// Only for internal microservices that share the symmetric key
	async decryptLocalToken(token: string): Promise<Record<string, unknown>> {
		if (!this.config.symmetricKey) {
			throw new Error(
				"symmetricKey required for v4.local decryption. Use introspect() instead.",
			);
		}

		const key = await V4.bytesToKeyObject(this.config.symmetricKey);
		const payload = await V4.decrypt(token, key, {
			issuer: `https://${this.config.domain}`,
			clockTolerance: "30s",
		});

		return payload;
	}

	// ── Introspect tokens via the authorization server ──
	// For third-party apps that can't decrypt v4.local tokens themselves
	async introspect(
		token: string,
	): Promise<{ active: boolean; [key: string]: unknown }> {
		const credentials = Buffer.from(
			`${this.config.clientId}:${this.config.clientSecret}`,
		).toString("base64");

		const res = await fetch(`https://${this.config.domain}/oauth2/introspect`, {
			method: "POST",
			headers: {
				Authorization: `Basic ${credentials}`,
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: new URLSearchParams({ token, token_type_hint: "access_token" }),
		});

		return res.json();
	}

	// ── Express/Koa middleware ──
	authenticate() {
		return async (req: any, res: any, next: any) => {
			const authHeader = req.headers.authorization;
			if (!authHeader?.startsWith("Bearer ")) {
				return res.status(401).json({ error: "missing_token" });
			}

			const token = authHeader.slice(7);

			try {
				let claims: Record<string, unknown>;

				if (token.startsWith("v4.local.")) {
					// Strategy 1: Decrypt locally (fast, requires symmetric key)
					if (this.config.symmetricKey) {
						claims = await this.decryptLocalToken(token);
					} else {
						// Strategy 2: Introspect via auth server (works for any client)
						const result = await this.introspect(token);
						if (!result.active) {
							return res.status(401).json({ error: "token_inactive" });
						}
						claims = result;
					}
				} else if (token.startsWith("v4.public.")) {
					// Public tokens can be verified by anyone with the public key
					claims = await this.verifyPublicToken(token);
				} else {
					return res.status(401).json({ error: "unsupported_token_format" });
				}

				// Attach user info to request
				req.user = {
					id: claims.sub as string,
					email: claims.email as string,
					tenantId: claims.tenant_id as string,
				};
				req.tokenClaims = claims;

				next();
			} catch (err) {
				return res.status(401).json({ error: "invalid_token" });
			}
		};
	}

	// ── ReBAC permission checks (unchanged from before) ──
	async check(params: {
		user: string;
		relation: string;
		object: string;
	}): Promise<boolean> {
		const res = await fetch(
			`https://${this.config.domain}/api/v1/authz/check`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${this.config.clientSecret}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(params),
			},
		);
		const data = await res.json();
		return data.allowed;
	}

	async listObjects(params: {
		user: string;
		relation: string;
		type: string;
	}): Promise<string[]> {
		const res = await fetch(
			`https://${this.config.domain}/api/v1/authz/list-objects`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${this.config.clientSecret}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(params),
			},
		);
		const data = await res.json();
		return data.objects;
	}
}
```

#### Go SDK

```go
// packages/sdk-go/client.go

package ssosdk

import (
    "context"
    "encoding/hex"
    "encoding/json"
    "fmt"
    "net/http"
    "net/url"
    "strings"
    "sync"
    "time"

    "aidanwoods.dev/go-paseto"
)

type Client struct {
    Domain       string
    ClientID     string
    ClientSecret string

    // For internal services that can decrypt v4.local tokens directly
    LocalKey     *paseto.V4SymmetricKey

    publicKey      paseto.V4AsymmetricPublicKey
    publicKeyOnce  sync.Once
    httpClient     *http.Client
}

// VerifyPublicToken verifies a v4.public PASETO (signed ID tokens)
func (c *Client) VerifyPublicToken(ctx context.Context, tokenStr string) (*paseto.Token, error) {
    pk, err := c.fetchPublicKey(ctx)
    if err != nil {
        return nil, fmt.Errorf("failed to fetch public key: %w", err)
    }

    parser := paseto.NewParser()
    parser.AddRule(paseto.NotExpired())
    parser.AddRule(paseto.IssuedBy(fmt.Sprintf("https://%s", c.Domain)))

    return parser.ParseV4Public(pk, tokenStr, nil)
}

// DecryptLocalToken decrypts a v4.local PASETO (encrypted access tokens)
// Only for services that hold the symmetric key
func (c *Client) DecryptLocalToken(tokenStr string) (*paseto.Token, error) {
    if c.LocalKey == nil {
        return nil, fmt.Errorf("symmetric key not configured; use Introspect() instead")
    }

    parser := paseto.NewParser()
    parser.AddRule(paseto.NotExpired())
    parser.AddRule(paseto.IssuedBy(fmt.Sprintf("https://%s", c.Domain)))

    return parser.ParseV4Local(*c.LocalKey, tokenStr, nil)
}

// Introspect calls the authorization server to validate a token
// Use when the service doesn't hold the symmetric key
func (c *Client) Introspect(ctx context.Context, tokenStr string) (*IntrospectionResult, error) {
    data := url.Values{
        "token":           {tokenStr},
        "token_type_hint": {"access_token"},
    }

    req, _ := http.NewRequestWithContext(ctx, "POST",
        fmt.Sprintf("https://%s/oauth2/introspect", c.Domain),
        strings.NewReader(data.Encode()),
    )
    req.SetBasicAuth(c.ClientID, c.ClientSecret)
    req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

    resp, err := c.httpClient.Do(req)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()

    var result IntrospectionResult
    json.NewDecoder(resp.Body).Decode(&result)
    return &result, nil
}

// fetchPublicKey retrieves v4.public keys from the discovery endpoint
func (c *Client) fetchPublicKey(ctx context.Context) (paseto.V4AsymmetricPublicKey, error) {
    var fetchErr error
    c.publicKeyOnce.Do(func() {
        req, _ := http.NewRequestWithContext(ctx, "GET",
            fmt.Sprintf("https://%s/.well-known/paseto-keys", c.Domain), nil)
        resp, err := c.httpClient.Do(req)
        if err != nil {
            fetchErr = err
            return
        }
        defer resp.Body.Close()

        var keys PASETOKeySet
        json.NewDecoder(resp.Body).Decode(&keys)

        for _, k := range keys.Keys {
            if k.Version == "v4" && k.Purpose == "public" {
                pk, err := paseto.NewV4AsymmetricPublicKeyFromHex(k.PublicKey)
                if err != nil {
                    fetchErr = err
                    return
                }
                c.publicKey = pk
                return
            }
        }
        fetchErr = fmt.Errorf("no v4.public key found in PASETO key set")
    })
    return c.publicKey, fetchErr
}

type IntrospectionResult struct {
    Active    bool   `json:"active"`
    Sub       string `json:"sub"`
    Email     string `json:"email"`
    TenantID  string `json:"tenant_id"`
    Scope     string `json:"scope"`
    TokenType string `json:"token_type"`
    Exp       int64  `json:"exp"`
}

type PASETOKeySet struct {
    Keys []PASETOKey `json:"keys"`
}

type PASETOKey struct {
    Version   string `json:"version"`    // "v4"
    Purpose   string `json:"purpose"`    // "public"
    PublicKey string `json:"public_key"` // Hex-encoded Ed25519 public key
    KeyID     string `json:"kid"`
    ExpiresAt string `json:"expires_at,omitempty"`
}
```

### Step F: PASETO vs JWT — Token Verification Flow Comparison

This diagram shows why PASETO is both simpler and more secure at the verification stage:

```
JWT Verification Flow (many things can go wrong):
─────────────────────────────────────────────────
1. Parse header (base64 decode)
2. Read "alg" field from header ← ATTACKER CONTROLS THIS
3. Switch on algorithm:
   ├── "RS256" → use RSA public key to verify
   ├── "HS256" → use HMAC shared secret ← attacker can force this with public key
   ├── "none"  → skip verification entirely ← disaster if not blocked
   ├── "ES256" → use ECDSA ← vulnerable to specific curve attacks
   └── ... 20+ algorithm choices, each with own attack surface
4. Verify signature using chosen algorithm
5. Parse payload
6. Validate claims (exp, iat, nbf, iss, aud)

PASETO v4.local Verification Flow (one path, no choices):
──────────────────────────────────────────────────────────
1. Check version prefix is "v4" ← version IS the algorithm, no negotiation
2. Check purpose is "local"
3. Decrypt with XChaCha20-Poly1305 using symmetric key
   └── If tampered: authentication tag fails → error
   └── If wrong key: decryption fails → error
   └── If wrong version: rejected immediately → error
4. Parse JSON payload
5. Validate claims (exp, iat, nbf, iss, aud)

PASETO v4.public Verification Flow (one path, no choices):
──────────────────────────────────────────────────────────
1. Check version prefix is "v4"
2. Check purpose is "public"
3. Verify Ed25519 signature using public key
   └── If tampered: signature invalid → error
   └── If wrong key: signature invalid → error
4. Parse JSON payload
5. Validate claims (exp, iat, nbf, iss, aud)
```

### Step G: JWT to PASETO Migration Strategy

If you're migrating an existing system from JWT to PASETO, use this phased approach:

```go
// migration/dual_token.go

// Phase 1: Issue both JWT and PASETO, accept both (2-4 weeks)
// Phase 2: Issue only PASETO, accept both (2-4 weeks)
// Phase 3: Issue only PASETO, accept only PASETO (permanent)

type DualTokenVerifier struct {
    pasetoService *TokenService        // PASETO v4
    jwtVerifier   *jwt.JWTVerifier     // Legacy JWT (read-only)
    phase         MigrationPhase
}

type MigrationPhase int
const (
    PhaseDual    MigrationPhase = 1  // Issue both, accept both
    PhaseIssueV4 MigrationPhase = 2  // Issue PASETO only, accept both
    PhaseFull    MigrationPhase = 3  // PASETO only
)

func (d *DualTokenVerifier) Verify(tokenStr string) (*UserClaims, error) {
    // PASETO tokens always start with "v4."
    if strings.HasPrefix(tokenStr, "v4.") {
        token, err := d.pasetoService.VerifyAccessToken(tokenStr)
        if err != nil {
            return nil, err
        }
        return extractClaimsFromPASETO(token), nil
    }

    // Legacy JWT — only accept during migration phases 1 & 2
    if d.phase == PhaseFull {
        return nil, fmt.Errorf("JWT tokens are no longer accepted, use PASETO v4")
    }

    // Verify JWT the old way
    claims, err := d.jwtVerifier.Verify(tokenStr)
    if err != nil {
        return nil, err
    }
    return extractClaimsFromJWT(claims), nil
}

// Migration checklist:
// □ Update all internal services to accept PASETO v4
// □ Update customer SDKs with PASETO support
// □ Publish /.well-known/paseto-keys endpoint
// □ Notify customers of migration timeline
// □ Enter Phase 1: dual issuance
// □ Monitor: track % of JWT vs PASETO tokens in use
// □ When JWT usage < 1%, enter Phase 2
// □ After deprecation window, enter Phase 3
// □ Remove JWT verification code entirely
```

### PASETO Performance Benchmarks

PASETO v4 is faster than JWT for most operations because Ed25519 and XChaCha20 are computationally simpler than RSA:

```
PASETO v4 (Ed25519 / XChaCha20) vs JWT (RS256 / HS256)
Hardware: Apple M1 Pro

┌──────────────────────────────┬──────────┬──────────┬──────────┐
│ Operation                    │ PASETO v4│  JWT     │ Winner   │
│                              │ (ns/op)  │ (ns/op)  │          │
├──────────────────────────────┼──────────┼──────────┼──────────┤
│ v4.local encrypt / HS256     │  2,397   │  1,200   │ JWT*     │
│ v4.local decrypt / HS256     │  2,260   │  1,100   │ JWT*     │
│ v4.public sign / RS256 sign  │ 24,680   │ 850,000  │ PASETO   │
│ v4.public verify / RS256     │ 52,875   │  28,000  │ JWT**    │
│ v4.public sign / EdDSA sign  │ 24,680   │  26,000  │ ~Tie     │
│ v4.public verify / EdDSA     │ 52,875   │  55,000  │ ~Tie     │
└──────────────────────────────┴──────────┴──────────┴──────────┘

* HS256 is simpler (just HMAC) but PASETO v4.local provides authenticated
  encryption (confidentiality + integrity), not just signing. Not apples-to-apples.

** RSA verification is fast but signing is 35x slower than Ed25519.
   In auth servers that sign millions of tokens/day, PASETO wins massively.

Key takeaway: For token ISSUANCE (the hot path on your auth server),
PASETO v4.public with Ed25519 is ~35x faster than JWT with RS256.
This matters at scale — the auth server does most of the signing.
```

---

## 10. Multi-Tenancy Strategy

### Isolation Levels

```
┌─────────────────────────────────────────────────────────────────┐
│                    Multi-Tenancy Spectrum                        │
│                                                                 │
│  Free/Starter          Pro                    Enterprise        │
│  ┌──────────┐    ┌──────────────┐    ┌───────────────────┐     │
│  │ Shared   │    │ Shared DB,   │    │ Dedicated DB,     │     │
│  │ Everything│   │ Row-level    │    │ Dedicated OpenFGA,│     │
│  │          │    │ isolation    │    │ Dedicated compute │     │
│  │ Tenant ID│    │ + Separate   │    │ + Custom domain   │     │
│  │ in every │    │ OpenFGA      │    │ + Data residency  │     │
│  │ query    │    │ store per    │    │ + SLA guarantee   │     │
│  │          │    │ tenant       │    │                   │     │
│  └──────────┘    └──────────────┘    └───────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

### Row-Level Security (PostgreSQL)

```sql
-- Enable RLS on all tenant-scoped tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON memberships
    USING (tenant_id = current_setting('app.current_tenant_id')::VARCHAR);

-- In your application middleware:
-- SET app.current_tenant_id = 'ten_01HZRTTG1NQJNE4EYSGFGH4RPC';
-- All subsequent queries are automatically filtered by TypeID
```

### Tenant Context Middleware

```go
func TenantContext() fiber.Handler {
    return func(c *fiber.Ctx) error {
        // Resolve tenant from:
        // 1. Subdomain: acme.yourplatform.com
        // 2. Custom domain: auth.acme.com
        // 3. Header: X-Tenant-ID
        // 4. PASETO claim: tenant_id

        host := c.Hostname()
        tenantSlug := extractSubdomain(host)

        tenant, err := tenantService.FindBySlugOrDomain(ctx, tenantSlug, host)
        if err != nil {
            return c.Status(404).JSON(fiber.Map{"error": "tenant not found"})
        }

        c.Locals("tenant", tenant)
        c.Locals("tenant_id", tenant.ID)

        // Set PostgreSQL RLS context
        db.Exec("SET app.current_tenant_id = $1", tenant.ID)

        return c.Next()
    }
}
```

---

## 11. Deployment & Infrastructure

### Kubernetes Deployment

```yaml
# kubernetes/authz-service/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: authz-service
  namespace: sso-platform
spec:
  replicas: 3
  selector:
    matchLabels:
      app: authz-service
  template:
    metadata:
      labels:
        app: authz-service
    spec:
      containers:
        - name: authz-service
          image: your-registry/authz-service:v1.0.0
          ports:
            - containerPort: 8080
          env:
            - name: OPENFGA_API_URL
              value: "http://openfga:8080"
            - name: REDIS_URL
              valueFrom:
                secretKeyRef:
                  name: redis-credentials
                  key: url
          resources:
            requests:
              cpu: "200m"
              memory: "256Mi"
            limits:
              cpu: "1000m"
              memory: "512Mi"
          livenessProbe:
            httpGet:
              path: /healthz
              port: 8080
            initialDelaySeconds: 5
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /readyz
              port: 8080
            initialDelaySeconds: 5
            periodSeconds: 5
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: authz-service-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: authz-service
  minReplicas: 3
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Pods
      pods:
        metric:
          name: http_requests_per_second
        target:
          type: AverageValue
          averageValue: "1000"
```

### OpenFGA Deployment

```yaml
# kubernetes/openfga/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: openfga
spec:
  replicas: 3
  template:
    spec:
      containers:
        - name: openfga
          image: openfga/openfga:latest
          args:
            - run
            - --datastore-engine=postgres
            - --datastore-uri=$(POSTGRES_URI)
            - --playground-enabled=false
            - --metrics-enabled=true
            - --log-format=json
          env:
            - name: POSTGRES_URI
              valueFrom:
                secretKeyRef:
                  name: openfga-db-credentials
                  key: uri
          ports:
            - containerPort: 8080 # HTTP
            - containerPort: 8081 # gRPC
            - containerPort: 2112 # Metrics
          resources:
            requests:
              cpu: "500m"
              memory: "512Mi"
            limits:
              cpu: "2000m"
              memory: "2Gi"
```

### Terraform (AWS Example)

```hcl
# infra/terraform/main.tf

module "vpc" {
  source = "terraform-aws-modules/vpc/aws"
  name   = "sso-platform-vpc"
  cidr   = "10.0.0.0/16"
  azs    = ["us-east-1a", "us-east-1b", "us-east-1c"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]
  enable_nat_gateway = true
}

module "eks" {
  source          = "terraform-aws-modules/eks/aws"
  cluster_name    = "sso-platform"
  cluster_version = "1.29"
  vpc_id          = module.vpc.vpc_id
  subnet_ids      = module.vpc.private_subnets

  eks_managed_node_groups = {
    general = {
      desired_size = 3
      min_size     = 3
      max_size     = 10
      instance_types = ["m6i.xlarge"]
    }
    authz = {
      desired_size = 3
      min_size     = 3
      max_size     = 20
      instance_types = ["c6i.xlarge"]  # CPU optimized for auth checks
      labels = { workload = "authz" }
    }
  }
}

module "rds" {
  source            = "terraform-aws-modules/rds/aws"
  identifier        = "sso-platform-primary"
  engine            = "postgres"
  engine_version    = "16.2"
  instance_class    = "db.r6g.xlarge"
  allocated_storage = 100
  multi_az          = true

  # Read replicas
  replica_count     = 3
}

module "elasticache" {
  source              = "terraform-aws-modules/elasticache/aws"
  cluster_id          = "sso-redis"
  engine              = "redis"
  node_type           = "cache.r6g.large"
  num_cache_clusters  = 6
  engine_version      = "7.0"
}
```

---

## 12. Monitoring & Observability

### Key Metrics to Track

```yaml
# Business Metrics
- Total active users (DAU/MAU)
- Logins per minute
- SSO vs password login ratio
- MFA adoption rate
- Failed login rate (potential attacks)
- Token refresh rate
- Average login latency (p50, p95, p99)

# Authorization Metrics
- OpenFGA check latency (p50, p95, p99)
- OpenFGA check throughput (checks/sec)
- Cache hit ratio for permission checks
- Tuple write rate
- Authorization model version distribution

# Infrastructure Metrics
- Service error rates (5xx)
- Database connection pool utilization
- Redis memory usage and eviction rate
- Kubernetes pod CPU/memory
- Certificate expiry countdown

# Security Metrics
- Brute force attempts per tenant
- Invalid token presentations
- SAML assertion validation failures
- Unusual login patterns (geo/time)
```

### OpenTelemetry Integration

```go
// shared/observability/tracing.go

func InitTracing(serviceName string) func() {
    exporter, _ := otlptracehttp.New(ctx,
        otlptracehttp.WithEndpoint("tempo:4318"),
    )

    tp := trace.NewTracerProvider(
        trace.WithBatcher(exporter),
        trace.WithResource(resource.NewWithAttributes(
            semconv.SchemaURL,
            semconv.ServiceNameKey.String(serviceName),
        )),
    )

    otel.SetTracerProvider(tp)
    return func() { tp.Shutdown(ctx) }
}

// Instrument OpenFGA calls
func (s *AuthzService) Check(ctx context.Context, ...) (bool, error) {
    ctx, span := tracer.Start(ctx, "authz.check",
        trace.WithAttributes(
            attribute.String("fga.user", check.User),
            attribute.String("fga.relation", check.Relation),
            attribute.String("fga.object", check.Object),
        ),
    )
    defer span.End()

    // ... check logic
    span.SetAttributes(attribute.Bool("fga.allowed", allowed))
    return allowed, nil
}
```

---

## 13. Security Checklist

### Authentication Security

- [ ] Passwords hashed with Argon2id (or bcrypt cost ≥ 12)
- [ ] Rate limiting on login endpoints (IP + account based)
- [ ] Account lockout after N failed attempts (with exponential backoff)
- [ ] PKCE required for all OAuth2 authorization code flows
- [ ] Refresh token rotation (one-time use, family detection)
- [ ] Secure session cookies (HttpOnly, Secure, SameSite=Lax)
- [ ] CSRF protection on all state-changing endpoints
- [ ] Password breach detection (HaveIBeenPwned API k-anonymity)

### Token & Identity Security

- [ ] **ALL bearer tokens are PASETO v4.local** — access tokens, refresh tokens, auth codes, MFA challenges
- [ ] No opaque UUID/random bearer tokens anywhere — every token is self-contained and encrypted
- [ ] Short-lived access tokens (15 min max) using PASETO v4.local
- [ ] Refresh tokens are self-contained PASETO v4.local (data encrypted inside, not stored in Redis)
- [ ] Authorization codes are self-contained PASETO v4.local (single-use enforced via JTI deny-list)
- [ ] MFA challenges are self-contained PASETO v4.local (5 min TTL, zero DB lookup)
- [ ] Ed25519 for PASETO v4.public signing (no algorithm negotiation)
- [ ] Key rotation strategy (PASETO footer with key IDs, per-purpose keys)
- [ ] Refresh token rotation with family-based replay detection
- [ ] Token binding via PASETO v4 implicit assertions (optional, for high-security tenants)
- [ ] JTI claims use crypto-random base64url strings (not UUIDs — matches PASETO spec convention)
- [ ] No `alg` header — PASETO eliminates algorithm confusion attacks entirely
- [ ] Symmetric keys (v4.local) stored in Vault, never in env vars
- [ ] Separate PASETO symmetric keys per token purpose (access, refresh, auth code, MFA challenge)
- [ ] OIDC ID tokens use JWT (RS256) only when required for third-party compatibility
- [ ] Redis stores only deny-lists and family trackers — NOT full token data

### Entity ID Security

- [ ] All database PKs use TypeID (type-prefixed ULIDs), not UUID v4
- [ ] TypeID prefix validation at API boundary (prevents `usr_` ID used as `ten_` ID)
- [ ] TypeIDs are sortable (ULID-based) — no B-tree fragmentation from random UUIDs
- [ ] Entity IDs never used as bearer tokens — bearer tokens are always PASETO v4.local

### Infrastructure Security

- [ ] mTLS between all services (via service mesh)
- [ ] Secrets in Vault, never in env vars or code
- [ ] Database encryption at rest (AES-256)
- [ ] TLS 1.3 for all external connections
- [ ] WAF rules for OWASP Top 10
- [ ] DDoS protection (Cloudflare / AWS Shield)
- [ ] Network segmentation (private subnets for data layer)
- [ ] Regular dependency scanning (Snyk, Trivy)
- [ ] Container image signing and scanning
- [ ] Penetration testing (quarterly)

### Compliance

- [ ] SOC 2 Type II audit trail (immutable audit logs)
- [ ] GDPR: data deletion, export, consent management
- [ ] Data residency controls per tenant
- [ ] Breach notification procedures
- [ ] Privacy policy and DPA templates

---

## 14. Cost Estimation & Scaling Benchmarks

### Infrastructure Costs (AWS, Monthly Estimates)

| Component             | Small (1K users) | Medium (100K users) | Large (1M+ users) |
| --------------------- | ---------------- | ------------------- | ----------------- |
| EKS Cluster           | $150             | $500                | $2,000            |
| Compute (EC2/Fargate) | $200             | $1,500              | $8,000            |
| RDS PostgreSQL        | $200             | $800                | $3,000            |
| ElastiCache Redis     | $100             | $400                | $1,500            |
| OpenFGA (compute)     | $100             | $500                | $2,000            |
| Load Balancer         | $30              | $100                | $400              |
| NAT Gateway           | $50              | $100                | $200              |
| S3 (audit logs)       | $5               | $50                 | $500              |
| Monitoring            | $50              | $200                | $800              |
| **Total**             | **~$900/mo**     | **~$4,150/mo**      | **~$18,400/mo**   |

### Performance Benchmarks (Targets)

| Operation                                        | p50     | p95     | p99    | Throughput  |
| ------------------------------------------------ | ------- | ------- | ------ | ----------- |
| Login (password + Argon2id)                      | 50ms    | 150ms   | 300ms  | 5,000 rps   |
| PASETO v4.local encrypt (token issue)            | 0.002ms | 0.005ms | 0.01ms | 400,000 rps |
| PASETO v4.local decrypt (token verify)           | 0.002ms | 0.005ms | 0.01ms | 440,000 rps |
| PASETO v4.public sign (ID token issue)           | 0.025ms | 0.05ms  | 0.1ms  | 40,000 rps  |
| PASETO v4.public verify                          | 0.053ms | 0.1ms   | 0.2ms  | 19,000 rps  |
| Token refresh (PASETO decrypt + deny-list check) | 3ms     | 10ms    | 20ms   | 30,000 rps  |
| Auth code exchange (PASETO decrypt, zero DB)     | 1ms     | 5ms     | 10ms   | 50,000 rps  |
| Token introspection (decrypt + check)            | 5ms     | 15ms    | 30ms   | 15,000 rps  |
| OpenFGA check (cached)                           | 1ms     | 3ms     | 5ms    | 50,000 rps  |
| OpenFGA check (uncached)                         | 5ms     | 15ms    | 30ms   | 10,000 rps  |
| SAML assertion validation                        | 20ms    | 50ms    | 100ms  | 2,000 rps   |
| Tuple write                                      | 10ms    | 30ms    | 50ms   | 5,000 rps   |
| User lookup                                      | 5ms     | 15ms    | 30ms   | 20,000 rps  |

---

## Implementation Roadmap

| Phase                   | Timeline    | Deliverables                                                                                                                                                                   |
| ----------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Phase 1: Foundation** | Weeks 1-4   | Go: identity-service (register, login, PASETO v4 tokens). NestJS: admin-api scaffold. Angular: login-portal scaffold. PostgreSQL schema with TypeIDs. Nx monorepo setup.       |
| **Phase 2: Core SSO**   | Weeks 5-10  | Go: sso-service (OIDC Provider, SAML SP), authz-service (OpenFGA integration, ReBAC model). Angular: consent flow screens, login UI. NestJS: tenant CRUD.                      |
| **Phase 3: Enterprise** | Weeks 11-16 | NestJS: directory-service (SCIM 2.0), webhook-service. Go: MFA (TOTP + WebAuthn). NestJS: audit-service. Angular: admin-console (org settings, user management, audit viewer). |
| **Phase 4: Scale**      | Weeks 17-22 | Caching layers, horizontal scaling, Kubernetes deployment, monitoring, rate limiting. NestJS ↔ Go gRPC integration.                                                            |
| **Phase 5: Polish**     | Weeks 23-28 | Angular: admin-console polish, developer-portal UI. NestJS: developer-portal-api (API key management). SDKs (Node, Go, Python). Swagger/OpenAPI docs auto-gen from NestJS.     |
| **Phase 6: Compliance** | Weeks 29-32 | SOC 2 prep, penetration testing, GDPR tooling, security hardening.                                                                                                             |

---

## 15. NestJS Platform Services

### NestJS Project Setup

```bash
# Generate NestJS apps within the Nx monorepo
npx nx g @nx/nest:application admin-api
npx nx g @nx/nest:application directory-service
npx nx g @nx/nest:application webhook-service
npx nx g @nx/nest:application audit-service

# Install shared dependencies
npm i @nestjs/swagger @nestjs/passport @nestjs/bull
npm i paseto               # PASETO v4 for TypeScript
npm i typeid-js             # TypeID generation
npm i prisma @prisma/client # ORM
npm i bullmq                # Job queue for webhooks
```

### NestJS PASETO Auth Guard

Every NestJS service validates PASETO v4.local tokens from the Go auth services:

```typescript
// libs/nestjs-auth/src/paseto.guard.ts

import {
	Injectable,
	CanActivate,
	ExecutionContext,
	UnauthorizedException,
} from "@nestjs/common";
import { V4 } from "paseto";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class PasetoAuthGuard implements CanActivate {
	private symmetricKey: KeyObject;

	constructor(private config: ConfigService) {}

	async onModuleInit() {
		// Load the shared PASETO v4.local symmetric key from Vault/env
		const keyHex = this.config.getOrThrow<string>("PASETO_SYMMETRIC_KEY");
		this.symmetricKey = await V4.bytesToKeyObject(Buffer.from(keyHex, "hex"));
	}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const request = context.switchToHttp().getRequest();
		const authHeader = request.headers.authorization;

		if (!authHeader?.startsWith("Bearer v4.local.")) {
			throw new UnauthorizedException("Missing or invalid PASETO v4 token");
		}

		const token = authHeader.slice(7); // Remove "Bearer "

		try {
			// Decrypt PASETO v4.local — validates expiry, issuer automatically
			const payload = await V4.decrypt(token, this.symmetricKey, {
				clockTolerance: "30s",
			});

			// Attach decoded claims to request
			request.user = {
				id: payload.sub, // TypeID: usr_01HZRTTG...
				email: payload.email,
				tenantId: payload.tenant_id, // TypeID: ten_01HZRTTG...
				scopes: payload.scopes,
				tokenId: payload.jti, // Crypto-random token ID
			};

			return true;
		} catch (err) {
			throw new UnauthorizedException("Invalid or expired PASETO token");
		}
	}
}

// Custom decorators for extracting user info
// libs/nestjs-auth/src/decorators.ts

import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export const CurrentUser = createParamDecorator(
	(data: string, ctx: ExecutionContext) => {
		const request = ctx.switchToHttp().getRequest();
		return data ? request.user?.[data] : request.user;
	},
);

export const TenantId = createParamDecorator(
	(_data: unknown, ctx: ExecutionContext) => {
		return ctx.switchToHttp().getRequest().user?.tenantId;
	},
);
```

### NestJS ReBAC Permission Guard

Checks OpenFGA permissions before allowing access to endpoints:

```typescript
// libs/nestjs-auth/src/rebac.guard.ts

import {
	Injectable,
	CanActivate,
	ExecutionContext,
	SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthzService } from "./authz.service";

// Decorator: @RequirePermission('can_read', 'document', 'id')
export const RequirePermission = (
	relation: string,
	objectType: string,
	paramKey: string,
) => SetMetadata("rebac", { relation, objectType, paramKey });

@Injectable()
export class ReBACGuard implements CanActivate {
	constructor(
		private reflector: Reflector,
		private authz: AuthzService,
	) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const rebac = this.reflector.get<{
			relation: string;
			objectType: string;
			paramKey: string;
		}>("rebac", context.getHandler());
		if (!rebac) return true; // No permission requirement

		const request = context.switchToHttp().getRequest();
		const userId = request.user.id; // usr_01HZRTTG...
		const objectId = request.params[rebac.paramKey];

		const allowed = await this.authz.check({
			user: `user:${userId}`,
			relation: rebac.relation,
			object: `${rebac.objectType}:${objectId}`,
		});

		if (!allowed) {
			throw new ForbiddenException(
				`You don't have '${rebac.relation}' permission on this ${rebac.objectType}`,
			);
		}

		return true;
	}
}
```

### NestJS Admin API Example

```typescript
// apps/admin-api/src/tenants/tenants.controller.ts

import {
	Controller,
	Get,
	Post,
	Patch,
	Delete,
	Body,
	Param,
	UseGuards,
	Query,
} from "@nestjs/common";
import {
	ApiTags,
	ApiOperation,
	ApiBearerAuth,
	ApiResponse,
} from "@nestjs/swagger";
import { PasetoAuthGuard } from "@sso-platform/nestjs-auth";
import { CurrentUser, TenantId } from "@sso-platform/nestjs-auth";
import { ReBACGuard, RequirePermission } from "@sso-platform/nestjs-auth";
import { TenantsService } from "./tenants.service";
import {
	CreateTenantDto,
	UpdateTenantDto,
	TenantResponseDto,
} from "./tenants.dto";

@ApiTags("Tenants")
@ApiBearerAuth("paseto-v4")
@UseGuards(PasetoAuthGuard, ReBACGuard)
@Controller("api/v1/orgs")
export class TenantsController {
	constructor(private readonly tenants: TenantsService) {}

	@Get()
	@ApiOperation({ summary: "List organizations the current user belongs to" })
	@ApiResponse({ status: 200, type: [TenantResponseDto] })
	async list(@CurrentUser("id") userId: string) {
		// Uses OpenFGA to find all orgs where user has 'member' or higher relation
		return this.tenants.listForUser(userId);
	}

	@Post()
	@ApiOperation({ summary: "Create a new organization" })
	async create(
		@CurrentUser("id") userId: string,
		@Body() dto: CreateTenantDto,
	) {
		// Creates tenant + writes OpenFGA tuple: user → owner → organization
		return this.tenants.create(userId, dto);
	}

	@Get(":id")
	@RequirePermission("can_view", "organization", "id")
	@ApiOperation({ summary: "Get organization details" })
	async findOne(@Param("id") id: string) {
		return this.tenants.findById(id); // id = ten_01HZRTTG...
	}

	@Patch(":id")
	@RequirePermission("can_manage_members", "organization", "id")
	@ApiOperation({ summary: "Update organization settings" })
	async update(@Param("id") id: string, @Body() dto: UpdateTenantDto) {
		return this.tenants.update(id, dto);
	}

	@Get(":id/members")
	@RequirePermission("can_view", "organization", "id")
	@ApiOperation({ summary: "List organization members" })
	async listMembers(
		@Param("id") id: string,
		@Query("cursor") cursor?: string,
		@Query("limit") limit: number = 20,
	) {
		return this.tenants.listMembers(id, { cursor, limit });
	}
}
```

### NestJS Tenant Service with Prisma + OpenFGA

```typescript
// apps/admin-api/src/tenants/tenants.service.ts

import { Injectable } from "@nestjs/common";
import { PrismaService } from "@sso-platform/prisma";
import { AuthzService } from "@sso-platform/nestjs-auth";
import { TypeID } from "typeid-js";

@Injectable()
export class TenantsService {
	constructor(
		private prisma: PrismaService,
		private authz: AuthzService,
	) {}

	async create(userId: string, dto: CreateTenantDto) {
		const tenantId = TypeID.withPrefix("ten").toString(); // ten_01HZRTTG...

		// 1. Create in Postgres
		const tenant = await this.prisma.tenant.create({
			data: {
				id: tenantId,
				name: dto.name,
				slug: dto.slug,
				plan: "free",
			},
		});

		// 2. Create OpenFGA store for this tenant
		const storeId = await this.authz.createStore(tenantId);
		await this.prisma.tenant.update({
			where: { id: tenantId },
			data: { openfgaStoreId: storeId },
		});

		// 3. Write ownership tuple: user → owner → organization
		await this.authz.writeTuple(storeId, {
			user: `user:${userId}`,
			relation: "owner",
			object: `organization:${tenantId}`,
		});

		// 4. Create membership record
		const membershipId = TypeID.withPrefix("mem").toString();
		await this.prisma.membership.create({
			data: {
				id: membershipId,
				userId,
				tenantId,
				role: "owner",
			},
		});

		return tenant;
	}

	async listForUser(userId: string) {
		// Query OpenFGA: list all organizations where user has 'member' relation
		const orgIds = await this.authz.listObjects({
			user: `user:${userId}`,
			relation: "member",
			type: "organization",
		});

		// Fetch full tenant data from Postgres
		return this.prisma.tenant.findMany({
			where: { id: { in: orgIds } },
			orderBy: { id: "desc" }, // TypeIDs are sortable — newest first
		});
	}
}
```

### NestJS Webhook Service with BullMQ

```typescript
// apps/webhook-service/src/webhook.processor.ts

import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { createHmac } from "crypto";

@Processor("webhooks")
export class WebhookProcessor extends WorkerHost {
	async process(job: Job<WebhookJobData>) {
		const { endpointUrl, payload, secret, attempt } = job.data;

		// Sign the payload with the endpoint's secret
		const signature = createHmac("sha256", secret)
			.update(JSON.stringify(payload))
			.digest("hex");

		try {
			const response = await fetch(endpointUrl, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-Webhook-Signature": `sha256=${signature}`,
					"X-Webhook-ID": payload.id, // TypeID: evt_01HZRTTG...
					"X-Webhook-Timestamp": payload.timestamp,
				},
				body: JSON.stringify(payload),
				signal: AbortSignal.timeout(10_000), // 10s timeout
			});

			if (!response.ok) {
				throw new Error(`Webhook delivery failed: ${response.status}`);
			}
		} catch (error) {
			// BullMQ handles exponential backoff retries automatically
			// Configured: 5 retries, backoff: 30s → 60s → 120s → 240s → 480s
			throw error;
		}
	}
}
```

### Go ↔ NestJS Communication (gRPC)

```protobuf
// libs/proto/authz.proto

syntax = "proto3";
package authz;

service AuthzService {
  rpc Check (CheckRequest) returns (CheckResponse);
  rpc BatchCheck (BatchCheckRequest) returns (BatchCheckResponse);
  rpc ListObjects (ListObjectsRequest) returns (ListObjectsResponse);
  rpc WriteTuple (WriteTupleRequest) returns (WriteTupleResponse);
}

message CheckRequest {
  string user = 1;      // "user:usr_01HZRTTG..."
  string relation = 2;  // "can_read"
  string object = 3;    // "document:doc_01HZRTTG..."
}

message CheckResponse {
  bool allowed = 1;
}

message ListObjectsRequest {
  string user = 1;
  string relation = 2;
  string type = 3;       // "organization", "document", etc.
}

message ListObjectsResponse {
  repeated string objects = 1;  // ["organization:ten_01HZRTTG...", ...]
}
```

```typescript
// NestJS side: gRPC client to call Go authz-service
// libs/nestjs-auth/src/authz.service.ts

import { Injectable, OnModuleInit } from "@nestjs/common";
import { ClientGrpc, Client, Transport } from "@nestjs/microservices";
import { join } from "path";
import { Observable, firstValueFrom } from "rxjs";

interface AuthzGrpcService {
	check(data: {
		user: string;
		relation: string;
		object: string;
	}): Observable<{ allowed: boolean }>;
	listObjects(data: {
		user: string;
		relation: string;
		type: string;
	}): Observable<{ objects: string[] }>;
	writeTuple(data: {
		user: string;
		relation: string;
		object: string;
	}): Observable<void>;
}

@Injectable()
export class AuthzService implements OnModuleInit {
	private grpcService: AuthzGrpcService;

	@Client({
		transport: Transport.GRPC,
		options: {
			package: "authz",
			protoPath: join(__dirname, "../../../libs/proto/authz.proto"),
			url: "authz-service:50051", // K8s service DNS
		},
	})
	private client: ClientGrpc;

	onModuleInit() {
		this.grpcService = this.client.getService<AuthzGrpcService>("AuthzService");
	}

	async check(req: {
		user: string;
		relation: string;
		object: string;
	}): Promise<boolean> {
		const result = await firstValueFrom(this.grpcService.check(req));
		return result.allowed;
	}

	async listObjects(req: {
		user: string;
		relation: string;
		type: string;
	}): Promise<string[]> {
		const result = await firstValueFrom(this.grpcService.listObjects(req));
		return result.objects;
	}

	async writeTuple(
		storeId: string,
		tuple: { user: string; relation: string; object: string },
	) {
		await firstValueFrom(this.grpcService.writeTuple(tuple));
	}
}
```

---

## 16. Angular Frontend

### Angular Project Setup

```bash
# Generate Angular apps within the Nx monorepo
npx nx g @nx/angular:application admin-console --style=css --routing=true --standalone
npx nx g @nx/angular:application login-portal --style=css --routing=true --standalone
npx nx g @nx/angular:application developer-portal --style=css --routing=true --standalone

# Generate shared libraries
npx nx g @nx/angular:library ui-components --standalone
npx nx g @nx/angular:library auth-guards
npx nx g @nx/angular:library api-client

# Install Tailwind CSS
npm i -D tailwindcss @tailwindcss/postcss postcss autoprefixer

# Each Angular app's tailwind.config.js:
# content: ['./src/**/*.{html,ts}', '../../libs/ui-components/src/**/*.{html,ts}']
```

### Angular Auth Interceptor (PASETO Token Attachment)

```typescript
// libs/auth-guards/src/lib/auth.interceptor.ts

import { HttpInterceptorFn, HttpErrorResponse } from "@angular/common/http";
import { inject } from "@angular/core";
import { Router } from "@angular/router";
import { catchError, switchMap, throwError } from "rxjs";
import { AuthService } from "./auth.service";

export const pasetoAuthInterceptor: HttpInterceptorFn = (req, next) => {
	const auth = inject(AuthService);
	const router = inject(Router);

	// Skip auth for public endpoints
	const publicPaths = ["/oauth2/", "/.well-known/", "/api/v1/auth/login"];
	if (publicPaths.some((p) => req.url.includes(p))) {
		return next(req);
	}

	const accessToken = auth.getAccessToken();
	if (!accessToken) {
		router.navigate(["/login"]);
		return throwError(() => new Error("No access token"));
	}

	// Attach PASETO v4.local token as Bearer
	const authReq = req.clone({
		setHeaders: { Authorization: `Bearer ${accessToken}` },
	});

	return next(authReq).pipe(
		catchError((error: HttpErrorResponse) => {
			if (error.status === 401) {
				// Access token expired — try refresh
				return auth.refreshTokens().pipe(
					switchMap((tokens) => {
						const retryReq = req.clone({
							setHeaders: { Authorization: `Bearer ${tokens.access_token}` },
						});
						return next(retryReq);
					}),
					catchError(() => {
						// Refresh failed — redirect to login
						auth.clearTokens();
						router.navigate(["/login"]);
						return throwError(() => error);
					}),
				);
			}
			return throwError(() => error);
		}),
	);
};
```

### Angular Auth Service (PASETO Token Management)

```typescript
// libs/auth-guards/src/lib/auth.service.ts

import { Injectable, signal, computed } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Router } from "@angular/router";
import { Observable, tap } from "rxjs";

interface TokenResponse {
	access_token: string; // v4.local.<encrypted>
	refresh_token: string; // v4.local.<encrypted>
	id_token: string; // v4.public.<signed>
	token_type: string;
	expires_in: number;
}

interface DecodedUser {
	id: string; // TypeID: usr_01HZRTTG...
	email: string;
	tenantId: string; // TypeID: ten_01HZRTTG...
	name: string;
}

@Injectable({ providedIn: "root" })
export class AuthService {
	private readonly _user = signal<DecodedUser | null>(null);
	readonly user = this._user.asReadonly();
	readonly isAuthenticated = computed(() => !!this._user());

	constructor(
		private http: HttpClient,
		private router: Router,
	) {
		// Try to restore session from stored tokens on app init
		this.tryRestoreSession();
	}

	login(
		email: string,
		password: string,
	): Observable<TokenResponse | MFAChallengeResponse> {
		return this.http.post<any>("/api/v1/auth/login", { email, password }).pipe(
			tap((response) => {
				if (response.mfa_required) {
					// MFA required — store challenge token, navigate to MFA screen
					sessionStorage.setItem("mfa_challenge", response.challenge_token);
					this.router.navigate(["/mfa"]);
				} else {
					this.handleTokenResponse(response);
				}
			}),
		);
	}

	verifyMFA(totpCode: string): Observable<TokenResponse> {
		const challengeToken = sessionStorage.getItem("mfa_challenge");
		return this.http
			.post<TokenResponse>("/api/v1/auth/mfa/verify", {
				challenge_token: challengeToken, // PASETO v4.local MFA challenge
				code: totpCode,
			})
			.pipe(
				tap((response) => {
					sessionStorage.removeItem("mfa_challenge");
					this.handleTokenResponse(response);
				}),
			);
	}

	refreshTokens(): Observable<TokenResponse> {
		const refreshToken = localStorage.getItem("refresh_token");
		return this.http
			.post<TokenResponse>("/oauth2/token", {
				grant_type: "refresh_token",
				refresh_token: refreshToken, // PASETO v4.local refresh token
			})
			.pipe(tap((response) => this.handleTokenResponse(response)));
	}

	logout(): void {
		const accessToken = this.getAccessToken();
		if (accessToken) {
			// Revoke on server (adds JTI to deny-list)
			this.http.post("/oauth2/revoke", { token: accessToken }).subscribe();
		}
		this.clearTokens();
		this.router.navigate(["/login"]);
	}

	getAccessToken(): string | null {
		return sessionStorage.getItem("access_token");
	}

	clearTokens(): void {
		sessionStorage.removeItem("access_token");
		localStorage.removeItem("refresh_token");
		localStorage.removeItem("id_token");
		this._user.set(null);
	}

	private handleTokenResponse(response: TokenResponse): void {
		// Store PASETO tokens
		// Access token in sessionStorage (cleared on tab close — more secure)
		sessionStorage.setItem("access_token", response.access_token);
		// Refresh token in localStorage (survives tab close — 30-day expiry)
		localStorage.setItem("refresh_token", response.refresh_token);
		// ID token for user display info
		localStorage.setItem("id_token", response.id_token);

		// Decode user from the v4.public ID token (payload is visible, signed)
		const user = this.decodePublicPaseto(response.id_token);
		this._user.set(user);
	}

	private decodePublicPaseto(token: string): DecodedUser | null {
		// v4.public tokens have the payload as base64-encoded JSON (visible but signed)
		// Format: v4.public.<payload+signature>.<footer>
		try {
			const parts = token.split(".");
			if (parts.length < 3 || parts[0] !== "v4" || parts[1] !== "public")
				return null;

			// The payload is the JSON + 64-byte Ed25519 signature
			// We only need the JSON portion for display (actual verification happens server-side)
			const rawPayload = atob(parts[2].replace(/-/g, "+").replace(/_/g, "/"));
			const jsonStr = rawPayload.slice(0, -64); // Remove 64-byte signature
			const claims = JSON.parse(jsonStr);

			return {
				id: claims.sub,
				email: claims.email,
				tenantId: claims.tenant_id,
				name: claims.name,
			};
		} catch {
			return null;
		}
	}

	private tryRestoreSession(): void {
		const idToken = localStorage.getItem("id_token");
		if (idToken) {
			const user = this.decodePublicPaseto(idToken);
			this._user.set(user);
		}
	}
}
```

### Angular ReBAC Permission Directive

```typescript
// libs/auth-guards/src/lib/has-permission.directive.ts

import {
	Directive,
	Input,
	TemplateRef,
	ViewContainerRef,
	OnInit,
	inject,
} from "@angular/core";
import { PermissionService } from "./permission.service";

// Usage: <button *hasPermission="'can_edit'; object: 'document:doc_01HZR...'">Edit</button>
@Directive({ selector: "[hasPermission]", standalone: true })
export class HasPermissionDirective implements OnInit {
	@Input() hasPermission!: string; // Relation: 'can_edit', 'can_delete'
	@Input() hasPermissionObject!: string; // Object: 'document:doc_01HZR...'

	private templateRef = inject(TemplateRef<any>);
	private viewContainer = inject(ViewContainerRef);
	private permissions = inject(PermissionService);

	async ngOnInit() {
		const allowed = await this.permissions.check(
			this.hasPermission,
			this.hasPermissionObject,
		);
		if (allowed) {
			this.viewContainer.createEmbeddedView(this.templateRef);
		} else {
			this.viewContainer.clear();
		}
	}
}

// libs/auth-guards/src/lib/permission.service.ts

@Injectable({ providedIn: "root" })
export class PermissionService {
	private cache = new Map<string, boolean>();

	constructor(
		private http: HttpClient,
		private auth: AuthService,
	) {}

	async check(relation: string, object: string): Promise<boolean> {
		const userId = this.auth.user()?.id;
		if (!userId) return false;

		const cacheKey = `${userId}:${relation}:${object}`;
		if (this.cache.has(cacheKey)) return this.cache.get(cacheKey)!;

		const result = await firstValueFrom(
			this.http.post<{ allowed: boolean }>("/api/v1/authz/check", {
				user: `user:${userId}`,
				relation,
				object,
			}),
		);

		this.cache.set(cacheKey, result.allowed);
		return result.allowed;
	}
}
```

### Angular Auth Route Guard

```typescript
// libs/auth-guards/src/lib/auth.guard.ts

import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";
import { AuthService } from "./auth.service";

export const authGuard: CanActivateFn = () => {
	const auth = inject(AuthService);
	const router = inject(Router);

	if (auth.isAuthenticated()) {
		return true;
	}

	return router.createUrlTree(["/login"]);
};

// Usage in routes:
// { path: 'dashboard', component: DashboardComponent, canActivate: [authGuard] }
```

### Angular Login Portal Component

```typescript
// apps/login-portal/src/app/login/login.component.ts

import { Component, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";
import { AuthService } from "@sso-platform/auth-guards";

@Component({
	selector: "app-login",
	standalone: true,
	imports: [CommonModule, FormsModule],
	template: `
		<div class="min-h-screen flex items-center justify-center bg-gray-50">
			<div class="w-full max-w-md space-y-8 p-8 bg-white rounded-2xl shadow-lg">
				<!-- Logo & Title -->
				<div class="text-center">
					<h1 class="text-2xl font-bold text-gray-900">
						Sign in to your account
					</h1>
					<p class="mt-2 text-sm text-gray-600">
						Secure authentication powered by PASETO v4
					</p>
				</div>

				<!-- Error Banner -->
				@if (error()) {
					<div class="rounded-lg bg-red-50 p-4 text-sm text-red-700">
						{{ error() }}
					</div>
				}

				<!-- Login Form -->
				<form (ngSubmit)="onSubmit()" class="space-y-6">
					<div>
						<label for="email" class="block text-sm font-medium text-gray-700">
							Email address
						</label>
						<input
							id="email"
							type="email"
							[(ngModel)]="email"
							name="email"
							required
							autocomplete="email"
							class="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-3
                     text-gray-900 placeholder-gray-400
                     focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500
                     transition-colors"
							placeholder="you@company.com"
						/>
					</div>

					<div>
						<label
							for="password"
							class="block text-sm font-medium text-gray-700"
						>
							Password
						</label>
						<input
							id="password"
							type="password"
							[(ngModel)]="password"
							name="password"
							required
							autocomplete="current-password"
							class="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-3
                     text-gray-900 placeholder-gray-400
                     focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500
                     transition-colors"
							placeholder="••••••••••••"
						/>
					</div>

					<button
						type="submit"
						[disabled]="loading()"
						class="w-full flex justify-center rounded-lg bg-indigo-600 px-4 py-3
                   text-sm font-semibold text-white shadow-sm
                   hover:bg-indigo-500 focus:ring-2 focus:ring-indigo-600
                   disabled:opacity-50 disabled:cursor-not-allowed
                   transition-colors"
					>
						@if (loading()) {
							<svg class="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
								<circle
									class="opacity-25"
									cx="12"
									cy="12"
									r="10"
									stroke="currentColor"
									stroke-width="4"
									fill="none"
								/>
								<path
									class="opacity-75"
									fill="currentColor"
									d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
								/>
							</svg>
							Signing in...
						} @else {
							Sign in
						}
					</button>
				</form>

				<!-- SSO Option -->
				<div class="text-center text-sm text-gray-500">
					<button
						(click)="onSSOLogin()"
						class="text-indigo-600 hover:text-indigo-500 font-medium"
					>
						Sign in with your organization's SSO
					</button>
				</div>
			</div>
		</div>
	`,
})
export class LoginComponent {
	email = "";
	password = "";
	loading = signal(false);
	error = signal<string | null>(null);

	constructor(
		private auth: AuthService,
		private router: Router,
	) {}

	onSubmit() {
		this.loading.set(true);
		this.error.set(null);

		this.auth.login(this.email, this.password).subscribe({
			next: (response) => {
				this.loading.set(false);
				if (!response.mfa_required) {
					this.router.navigate(["/dashboard"]);
				}
				// If MFA required, AuthService already navigated to /mfa
			},
			error: (err) => {
				this.loading.set(false);
				this.error.set(err.error?.error || "Invalid credentials");
			},
		});
	}

	onSSOLogin() {
		// Redirect to SSO discovery with email domain hint
		const domain = this.email.split("@")[1];
		if (domain) {
			window.location.href = `/api/v1/auth/login/sso?domain_hint=${domain}`;
		}
	}
}
```

### Angular Admin Console — Members Page Example

```typescript
// apps/admin-console/src/app/members/members.component.ts

import { Component, OnInit, signal, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { HttpClient } from "@angular/common/http";
import { AuthService, HasPermissionDirective } from "@sso-platform/auth-guards";

interface Member {
	id: string; // TypeID: mem_01HZRTTG...
	userId: string; // TypeID: usr_01HZRTTG...
	email: string;
	displayName: string;
	role: string;
	joinedAt: string;
}

@Component({
	selector: "app-members",
	standalone: true,
	imports: [CommonModule, HasPermissionDirective],
	template: `
		<div class="p-8">
			<div class="flex items-center justify-between mb-8">
				<div>
					<h1 class="text-2xl font-bold text-gray-900">Team Members</h1>
					<p class="mt-1 text-sm text-gray-500">
						Manage who has access to your organization
					</p>
				</div>

				<!-- Only show invite button if user has can_manage_members -->
				<button
					*hasPermission="'can_manage_members'; object: orgObject()"
					class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white
                 hover:bg-indigo-500 transition-colors"
				>
					Invite member
				</button>
			</div>

			<!-- Members Table -->
			<div
				class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
			>
				<table class="min-w-full divide-y divide-gray-200">
					<thead class="bg-gray-50">
						<tr>
							<th
								class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase"
							>
								Member
							</th>
							<th
								class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase"
							>
								Role
							</th>
							<th
								class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase"
							>
								Joined
							</th>
							<th class="px-6 py-3"></th>
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-200">
						@for (member of members(); track member.id) {
							<tr class="hover:bg-gray-50 transition-colors">
								<td class="px-6 py-4">
									<div class="flex items-center gap-3">
										<div
											class="h-8 w-8 rounded-full bg-indigo-100 flex items-center
                                justify-center text-sm font-medium text-indigo-700"
										>
											{{ member.displayName.charAt(0) }}
										</div>
										<div>
											<div class="text-sm font-medium text-gray-900">
												{{ member.displayName }}
											</div>
											<div class="text-xs text-gray-500">
												{{ member.email }}
											</div>
										</div>
									</div>
								</td>
								<td class="px-6 py-4">
									<span
										class="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium"
										[class]="roleClass(member.role)"
									>
										{{ member.role }}
									</span>
								</td>
								<td class="px-6 py-4 text-sm text-gray-500">
									{{ member.joinedAt | date: "mediumDate" }}
								</td>
								<td class="px-6 py-4 text-right">
									<button
										*hasPermission="'can_manage_members'; object: orgObject()"
										class="text-sm text-gray-400 hover:text-red-600 transition-colors"
									>
										Remove
									</button>
								</td>
							</tr>
						}
					</tbody>
				</table>
			</div>
		</div>
	`,
})
export class MembersComponent implements OnInit {
	private http = inject(HttpClient);
	private auth = inject(AuthService);

	members = signal<Member[]>([]);

	orgObject(): string {
		return `organization:${this.auth.user()?.tenantId}`;
	}

	ngOnInit() {
		const tenantId = this.auth.user()?.tenantId;
		this.http
			.get<Member[]>(`/api/v1/orgs/${tenantId}/members`)
			.subscribe((members) => this.members.set(members));
	}

	roleClass(role: string): string {
		const classes: Record<string, string> = {
			owner: "bg-purple-100 text-purple-800",
			admin: "bg-blue-100 text-blue-800",
			member: "bg-gray-100 text-gray-700",
		};
		return classes[role] || classes["member"];
	}
}
```

### Angular App Configuration

```typescript
// apps/admin-console/src/app/app.config.ts

import { ApplicationConfig, provideZoneChangeDetection } from "@angular/core";
import { provideRouter } from "@angular/router";
import { provideHttpClient, withInterceptors } from "@angular/common/http";
import { pasetoAuthInterceptor } from "@sso-platform/auth-guards";
import { routes } from "./app.routes";

export const appConfig: ApplicationConfig = {
	providers: [
		provideZoneChangeDetection({ eventCoalescing: true }),
		provideRouter(routes),
		provideHttpClient(
			withInterceptors([pasetoAuthInterceptor]), // Attach PASETO tokens to all requests
		),
	],
};

// apps/admin-console/src/app/app.routes.ts

import { Routes } from "@angular/router";
import { authGuard } from "@sso-platform/auth-guards";

export const routes: Routes = [
	{
		path: "",
		canActivate: [authGuard],
		children: [
			{ path: "", redirectTo: "dashboard", pathMatch: "full" },
			{
				path: "dashboard",
				loadComponent: () =>
					import("./dashboard/dashboard.component").then(
						(m) => m.DashboardComponent,
					),
			},
			{
				path: "members",
				loadComponent: () =>
					import("./members/members.component").then((m) => m.MembersComponent),
			},
			{
				path: "settings",
				loadComponent: () =>
					import("./settings/settings.component").then(
						(m) => m.SettingsComponent,
					),
			},
			{
				path: "audit-log",
				loadComponent: () =>
					import("./audit-log/audit-log.component").then(
						(m) => m.AuditLogComponent,
					),
			},
		],
	},
	{
		path: "login",
		loadComponent: () =>
			import("./login/login.component").then((m) => m.LoginComponent),
	},
];
```

### Shared TypeScript Types (NestJS ↔ Angular)

```typescript
// libs/shared-types/src/lib/models.ts

// These types are shared between NestJS services and Angular apps
// Single source of truth — change once, both sides update

export interface User {
	id: string; // TypeID: usr_01HZRTTG...
	email: string;
	displayName: string;
	status: "active" | "suspended" | "deactivated";
	mfaEnabled: boolean;
	emailVerified: boolean;
	createdAt: string;
}

export interface Tenant {
	id: string; // TypeID: ten_01HZRTTG...
	name: string;
	slug: string;
	domain?: string;
	plan: "free" | "pro" | "enterprise";
	settings: TenantSettings;
}

export interface Membership {
	id: string; // TypeID: mem_01HZRTTG...
	userId: string;
	tenantId: string;
	role: "owner" | "admin" | "member";
	joinedAt: string;
}

export interface AuthzCheckRequest {
	user: string; // "user:usr_01HZRTTG..."
	relation: string; // "can_read", "can_edit", "can_delete"
	object: string; // "document:doc_01HZRTTG..."
}

export interface AuthzCheckResponse {
	allowed: boolean;
}

export interface TokenResponse {
	access_token: string; // PASETO v4.local
	refresh_token: string; // PASETO v4.local
	id_token: string; // PASETO v4.public
	token_type: "Bearer";
	expires_in: number;
}

export interface MFAChallengeResponse {
	mfa_required: true;
	challenge_token: string; // PASETO v4.local
	methods: ("totp" | "webauthn" | "backup_code")[];
}
```

---

## Key Resources

- **PASETO Specification:** https://paseto.io/rfc/
- **PASETO Website & Libraries:** https://paseto.io
- **Go PASETO Library (aidanwoods):** https://pkg.go.dev/aidanwoods.dev/go-paseto
- **TypeID Specification:** https://github.com/jetify-com/typeid
- **Go TypeID Library:** https://pkg.go.dev/go.jetify.com/typeid
- **ULID Specification:** https://github.com/ulid/spec
- **OpenFGA Documentation:** https://openfga.dev/docs
- **Google Zanzibar Paper:** "Zanzibar: Google's Consistent, Global Authorization System" (2019)
- **NestJS Documentation:** https://docs.nestjs.com
- **Angular Documentation:** https://angular.dev
- **Tailwind CSS:** https://tailwindcss.com/docs
- **Nx Monorepo:** https://nx.dev
- **Prisma ORM:** https://www.prisma.io/docs
- **Go Fiber:** https://docs.gofiber.io
- **OIDC Spec:** https://openid.net/specs/openid-connect-core-1_0.html
- **SAML 2.0 Spec:** http://docs.oasis-open.org/security/saml/v2.0/
- **SCIM 2.0 Spec:** https://datatracker.ietf.org/doc/html/rfc7644
- **OAuth 2.1 Draft:** https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-07

---

## Architecture Philosophy Summary

This guide follows a core design principle inspired by PASETO's philosophy — **the token IS the data**:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   TRADITIONAL APPROACH              THIS ARCHITECTURE                   │
│   (UUID + Redis/DB lookup)          (PASETO + TypeID, zero-lookup)      │
│                                                                         │
│   Access Token:                     Access Token:                       │
│     UUID → Redis → claims             v4.local → decrypt → claims       │
│                                                                         │
│   Refresh Token:                    Refresh Token:                      │
│     random bytes → Redis → data       v4.local → decrypt → data         │
│                                       (Redis: deny-list only)           │
│                                                                         │
│   Auth Code:                        Auth Code:                          │
│     random string → Redis → data      v4.local → decrypt → data         │
│                                       (Redis: single-use JTI only)      │
│                                                                         │
│   MFA Challenge:                    MFA Challenge:                      │
│     UUID → Redis → challenge data     v4.local → decrypt → challenge    │
│                                       (Redis: nothing)                  │
│                                                                         │
│   Session:                          Session:                            │
│     UUID → Redis → session data       v4.local → decrypt → session      │
│                                       (DB: audit row only)              │
│                                                                         │
│   User ID:                          User ID:                            │
│     550e8400-e29b-41d4-...            usr_01HZRTTG1NQJNE4EYSGFGH4RPC   │
│     (random, unsortable, untyped)     (sorted, typed, debuggable)       │
│                                                                         │
│   Token ID (jti):                   Token ID (jti):                     │
│     550e8400-e29b-41d4-...            7xK9mPfQ2nRtYwLz3hBv   (24 char) │
│     (36 chars, structured, overkill)  (crypto-random, compact)          │
│                                                                         │
│   RESULT: Every bearer credential is encrypted + self-contained.        │
│   Redis usage drops ~70%. Database lookups drop to near-zero for auth.  │
│   TypeIDs make debugging trivial and indexes fast.                      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

Start with Phase 1, validate your assumptions with real users, and iteratively add complexity. The beauty of this architecture is that the authorization model (OpenFGA ReBAC), the token format (PASETO v4), and the ID scheme (TypeID) can each evolve independently without rewriting the others.
