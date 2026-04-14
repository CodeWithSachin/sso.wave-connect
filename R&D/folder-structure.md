# SSO Platform — Production Folder Structure

## Nx Monorepo Root

```
sso-platform/
├── nx.json                                  # Nx workspace config (task runners, caching, affected)
├── tsconfig.base.json                       # Base TypeScript config shared by all TS projects
├── package.json                             # Root dependencies + Nx plugins
├── pnpm-workspace.yaml                      # pnpm workspace (or yarn/npm)
├── .env.example                             # Template — NEVER commit .env
├── .gitignore
├── .eslintrc.json                           # Root ESLint config
├── .prettierrc                              # Code formatting rules
├── .husky/                                  # Git hooks (pre-commit, commit-msg)
│   ├── pre-commit                           # lint-staged
│   └── commit-msg                           # commitlint (conventional commits)
├── commitlint.config.js                     # Enforce conventional commit messages
│
│
│── ─────────────────────────────────────────
│   APPLICATIONS
│── ─────────────────────────────────────────
│
├── apps/
│   │
│   │── ── GO SERVICES (Hot-Path Auth) ──────
│   │
│   ├── identity-service/                    # Go (Fiber) — Registration, Login, Tokens, MFA
│   │   ├── cmd/
│   │   │   └── server/
│   │   │       └── main.go                  # Entrypoint: Fiber app, graceful shutdown
│   │   ├── internal/
│   │   │   ├── config/
│   │   │   │   ├── config.go                # Viper config loader (env, vault, file)
│   │   │   │   └── config_test.go
│   │   │   ├── handler/                     # HTTP handlers (Fiber routes)
│   │   │   │   ├── auth.go                  # POST /auth/register, POST /auth/login
│   │   │   │   ├── auth_test.go
│   │   │   │   ├── mfa.go                   # POST /auth/mfa/enroll, POST /auth/mfa/verify
│   │   │   │   ├── mfa_test.go
│   │   │   │   ├── token.go                 # POST /oauth2/token, POST /oauth2/revoke
│   │   │   │   ├── token_test.go
│   │   │   │   ├── session.go               # GET /sessions, DELETE /sessions/:id
│   │   │   │   ├── session_test.go
│   │   │   │   ├── wellknown.go             # GET /.well-known/openid-configuration, /paseto-keys
│   │   │   │   └── health.go               # GET /healthz, GET /readyz
│   │   │   ├── middleware/
│   │   │   │   ├── auth.go                  # PASETO v4.local token validation
│   │   │   │   ├── ratelimit.go             # IP + account-based rate limiting
│   │   │   │   ├── tenant.go                # Extract tenant from host/header, SET LOCAL
│   │   │   │   ├── requestid.go             # X-Request-ID injection (UUIDv7)
│   │   │   │   ├── cors.go                  # Per-tenant CORS config
│   │   │   │   └── recovery.go              # Panic recovery + structured logging
│   │   │   ├── service/
│   │   │   │   ├── token.go                 # PASETO v4.local/v4.public mint + verify
│   │   │   │   ├── token_test.go
│   │   │   │   ├── password.go              # Argon2id hashing, breach check (HaveIBeenPwned)
│   │   │   │   ├── password_test.go
│   │   │   │   ├── mfa.go                   # TOTP generation/validation, WebAuthn ceremony
│   │   │   │   ├── mfa_test.go
│   │   │   │   ├── session.go               # Session lifecycle (create, revoke, extend)
│   │   │   │   └── session_test.go
│   │   │   ├── repository/                  # Data access (Postgres via pgx/pgxpool)
│   │   │   │   ├── user.go                  # CRUD users, password history
│   │   │   │   ├── user_test.go
│   │   │   │   ├── membership.go            # User-tenant memberships
│   │   │   │   ├── session.go               # Session CRUD
│   │   │   │   ├── token_deny.go            # JTI deny-list (Postgres fallback)
│   │   │   │   ├── refresh_family.go        # Refresh token family tracking
│   │   │   │   └── idp.go                   # Identity provider configs
│   │   │   ├── model/                       # Domain structs
│   │   │   │   ├── user.go                  # User, Membership, PasswordHistory
│   │   │   │   ├── token.go                 # TokenClaims, RefreshFamily, DenyEntry
│   │   │   │   ├── session.go               # Session
│   │   │   │   ├── mfa.go                   # MFAEnrollment, BackupCode
│   │   │   │   └── idp.go                   # IdentityProvider, FederatedIdentity
│   │   │   ├── event/                       # Async events (NATS/Kafka publisher)
│   │   │   │   ├── publisher.go             # Event bus interface + NATS implementation
│   │   │   │   ├── events.go                # Event type constants + payload structs
│   │   │   │   └── publisher_test.go
│   │   │   └── id/                          # TypeID + UUSID generators
│   │   │       ├── typeid.go                # NewUserID(), NewTenantID(), NewSessionID()...
│   │   │       ├── uusid.go                 # Encrypted IDs, content-based IDs, compact JTIs
│   │   │       └── typeid_test.go
│   │   ├── migrations/                      # golang-migrate SQL files
│   │   │   ├── 000001_init_schema.up.sql
│   │   │   ├── 000001_init_schema.down.sql
│   │   │   ├── 000002_add_mfa.up.sql
│   │   │   ├── 000002_add_mfa.down.sql
│   │   │   ├── 000003_add_authz_outbox.up.sql
│   │   │   └── 000003_add_authz_outbox.down.sql
│   │   ├── Dockerfile                       # Multi-stage: builder (Go 1.22) → distroless
│   │   ├── go.mod
│   │   ├── go.sum
│   │   └── project.json                     # Nx project config for Go (custom executors)
│   │
│   ├── authz-service/                       # Go (Fiber) — OpenFGA ReBAC, Permission Checks
│   │   ├── cmd/
│   │   │   └── server/
│   │   │       └── main.go                  # Fiber + gRPC dual listener (HTTP 8080, gRPC 50051)
│   │   ├── internal/
│   │   │   ├── config/
│   │   │   │   └── config.go
│   │   │   ├── handler/
│   │   │   │   ├── authz.go                 # REST: POST /authz/check, /authz/batch-check
│   │   │   │   ├── authz_test.go
│   │   │   │   ├── tuple.go                 # REST: POST/DELETE /authz/tuples
│   │   │   │   ├── model.go                 # REST: GET /authz/model, POST /authz/model/migrate
│   │   │   │   └── health.go
│   │   │   ├── grpc/                        # gRPC server (NestJS calls this)
│   │   │   │   ├── server.go                # gRPC server setup + reflection
│   │   │   │   ├── authz_grpc.go            # AuthzService gRPC implementation
│   │   │   │   └── authz_grpc_test.go
│   │   │   ├── service/
│   │   │   │   ├── authz.go                 # OpenFGA client wrapper (Check, Write, List)
│   │   │   │   ├── authz_test.go
│   │   │   │   ├── cache.go                 # L1 (Ristretto) + L2 (Redis) permission cache
│   │   │   │   ├── cache_test.go
│   │   │   │   ├── model.go                 # Authorization model migration + validation
│   │   │   │   └── outbox.go                # Outbox worker: drain pending tuples to OpenFGA
│   │   │   ├── repository/
│   │   │   │   ├── outbox.go                # authz_outbox table CRUD
│   │   │   │   ├── permission_cache.go      # L3 Postgres permission cache CRUD
│   │   │   │   └── store.go                 # Tenant → OpenFGA store mapping
│   │   │   ├── model/
│   │   │   │   ├── tuple.go                 # Tuple, CheckRequest, CheckResponse
│   │   │   │   └── outbox.go                # OutboxEntry struct
│   │   │   └── middleware/
│   │   │       ├── auth.go                  # Internal service-to-service PASETO validation
│   │   │       └── tenant.go
│   │   ├── Dockerfile
│   │   ├── go.mod
│   │   ├── go.sum
│   │   └── project.json
│   │
│   ├── sso-service/                         # Go (Fiber) — OIDC Provider, SAML SP
│   │   ├── cmd/
│   │   │   └── server/
│   │   │       └── main.go
│   │   ├── internal/
│   │   │   ├── config/
│   │   │   │   └── config.go
│   │   │   ├── handler/
│   │   │   │   ├── oauth2.go                # GET /oauth2/authorize, POST /oauth2/token
│   │   │   │   ├── oauth2_test.go
│   │   │   │   ├── saml.go                  # POST /saml/acs, GET /saml/metadata
│   │   │   │   ├── saml_test.go
│   │   │   │   ├── oidc.go                  # GET /userinfo, GET /.well-known/openid-configuration
│   │   │   │   ├── consent.go               # GET/POST /oauth2/consent
│   │   │   │   ├── device.go                # POST /oauth2/device, POST /oauth2/device/poll
│   │   │   │   └── health.go
│   │   │   ├── middleware/
│   │   │   │   ├── auth.go
│   │   │   │   ├── pkce.go                  # PKCE challenge/verifier validation
│   │   │   │   └── tenant.go
│   │   │   ├── service/
│   │   │   │   ├── oauth2.go                # Authorization code flow, client credentials
│   │   │   │   ├── saml.go                  # SAML assertion parsing, attribute mapping
│   │   │   │   ├── oidc.go                  # ID token claims, userinfo construction
│   │   │   │   ├── consent.go               # Consent management
│   │   │   │   └── jwks.go                  # Ed25519 key management for v4.public
│   │   │   ├── repository/
│   │   │   │   ├── oauth_client.go          # OAuth client CRUD
│   │   │   │   ├── consent.go               # User consent CRUD
│   │   │   │   └── idp.go                   # Identity provider CRUD + SAML cert storage
│   │   │   └── model/
│   │   │       ├── oauth.go                 # OAuthClient, AuthorizationCode, Consent
│   │   │       ├── saml.go                  # SAMLAssertion, AttributeMapping
│   │   │       └── oidc.go                  # OIDCClaims, DiscoveryDocument
│   │   ├── Dockerfile
│   │   ├── go.mod
│   │   ├── go.sum
│   │   └── project.json
│   │
│   │── ── NESTJS SERVICES (Platform CRUD) ──
│   │
│   ├── admin-api/                           # NestJS — Tenant, User, Group CRUD for Admin Console
│   │   ├── src/
│   │   │   ├── main.ts                      # Bootstrap: Nest app, Swagger setup, global pipes
│   │   │   ├── app.module.ts                # Root module (imports all feature modules)
│   │   │   ├── tenants/
│   │   │   │   ├── tenants.module.ts
│   │   │   │   ├── tenants.controller.ts    # @UseGuards(PasetoAuthGuard, ReBACGuard)
│   │   │   │   ├── tenants.controller.spec.ts
│   │   │   │   ├── tenants.service.ts       # Prisma + OpenFGA store creation
│   │   │   │   ├── tenants.service.spec.ts
│   │   │   │   └── dto/
│   │   │   │       ├── create-tenant.dto.ts # class-validator decorators
│   │   │   │       ├── update-tenant.dto.ts
│   │   │   │       └── tenant-response.dto.ts
│   │   │   ├── users/
│   │   │   │   ├── users.module.ts
│   │   │   │   ├── users.controller.ts
│   │   │   │   ├── users.controller.spec.ts
│   │   │   │   ├── users.service.ts
│   │   │   │   ├── users.service.spec.ts
│   │   │   │   └── dto/
│   │   │   │       ├── create-user.dto.ts
│   │   │   │       ├── update-user.dto.ts
│   │   │   │       └── user-response.dto.ts
│   │   │   ├── memberships/
│   │   │   │   ├── memberships.module.ts
│   │   │   │   ├── memberships.controller.ts
│   │   │   │   ├── memberships.service.ts   # Writes to memberships + authz_outbox in one tx
│   │   │   │   └── dto/
│   │   │   │       ├── invite-member.dto.ts
│   │   │   │       └── update-role.dto.ts
│   │   │   ├── groups/
│   │   │   │   ├── groups.module.ts
│   │   │   │   ├── groups.controller.ts
│   │   │   │   ├── groups.service.ts        # Group CRUD + OpenFGA group tuple sync
│   │   │   │   └── dto/
│   │   │   │       ├── create-group.dto.ts
│   │   │   │       ├── add-member.dto.ts
│   │   │   │       └── nest-group.dto.ts
│   │   │   ├── identity-providers/
│   │   │   │   ├── idp.module.ts
│   │   │   │   ├── idp.controller.ts
│   │   │   │   ├── idp.service.ts           # SAML/OIDC IdP config management
│   │   │   │   └── dto/
│   │   │   │       ├── create-saml-idp.dto.ts
│   │   │   │       ├── create-oidc-idp.dto.ts
│   │   │   │       └── update-idp.dto.ts
│   │   │   ├── resources/                   # Folders, Documents, API Resources
│   │   │   │   ├── resources.module.ts
│   │   │   │   ├── folders.controller.ts
│   │   │   │   ├── folders.service.ts       # Folder CRUD + parent tuple writes
│   │   │   │   ├── documents.controller.ts
│   │   │   │   ├── documents.service.ts     # Document CRUD + parent_folder tuples
│   │   │   │   ├── api-resources.controller.ts
│   │   │   │   ├── api-resources.service.ts
│   │   │   │   └── dto/
│   │   │   │       ├── create-folder.dto.ts
│   │   │   │       ├── create-document.dto.ts
│   │   │   │       ├── share-resource.dto.ts  # { userId, relation: 'viewer'|'editor' }
│   │   │   │       └── create-api-resource.dto.ts
│   │   │   ├── settings/                    # Tenant policies, feature flags
│   │   │   │   ├── settings.module.ts
│   │   │   │   ├── policies.controller.ts
│   │   │   │   ├── policies.service.ts
│   │   │   │   ├── feature-flags.controller.ts
│   │   │   │   ├── feature-flags.service.ts
│   │   │   │   └── dto/
│   │   │   │       ├── update-policy.dto.ts
│   │   │   │       └── upsert-flag.dto.ts
│   │   │   └── shared/
│   │   │       ├── prisma/
│   │   │       │   ├── prisma.module.ts
│   │   │       │   └── prisma.service.ts    # PrismaClient lifecycle (onModuleInit/Destroy)
│   │   │       ├── filters/
│   │   │       │   └── http-exception.filter.ts
│   │   │       └── interceptors/
│   │   │           ├── logging.interceptor.ts
│   │   │           └── timeout.interceptor.ts
│   │   ├── prisma/
│   │   │   ├── schema.prisma               # Prisma schema (mirrors database-schema-v2.sql)
│   │   │   └── seed.ts                     # Dev seed data
│   │   ├── test/
│   │   │   ├── app.e2e-spec.ts
│   │   │   └── jest-e2e.json
│   │   ├── Dockerfile
│   │   ├── tsconfig.app.json
│   │   └── project.json
│   │
│   ├── directory-service/                   # NestJS — SCIM 2.0 Provisioning
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   ├── scim/
│   │   │   │   ├── scim.module.ts
│   │   │   │   ├── scim-users.controller.ts     # /scim/v2/Users (GET, POST, PATCH, DELETE)
│   │   │   │   ├── scim-groups.controller.ts    # /scim/v2/Groups
│   │   │   │   ├── scim-schemas.controller.ts   # /scim/v2/Schemas, /scim/v2/ServiceProviderConfig
│   │   │   │   ├── scim-users.service.ts        # User provisioning + authz_outbox writes
│   │   │   │   ├── scim-groups.service.ts       # Group provisioning + group tuple sync
│   │   │   │   ├── scim-auth.guard.ts           # SCIM bearer token validation
│   │   │   │   ├── scim-filter.parser.ts        # SCIM filter syntax parser (userName eq "...")
│   │   │   │   └── dto/
│   │   │   │       ├── scim-user.dto.ts         # SCIM 2.0 User schema
│   │   │   │       ├── scim-group.dto.ts        # SCIM 2.0 Group schema
│   │   │   │       ├── scim-list-response.dto.ts
│   │   │   │       └── scim-error.dto.ts
│   │   │   ├── sync/
│   │   │   │   ├── sync.module.ts
│   │   │   │   ├── idp-sync.service.ts          # SAML/OIDC group sync on login
│   │   │   │   └── reconciliation.service.ts    # Periodic full sync (cron)
│   │   │   └── shared/
│   │   │       └── prisma/
│   │   │           ├── prisma.module.ts
│   │   │           └── prisma.service.ts
│   │   ├── prisma/
│   │   │   └── schema.prisma
│   │   ├── test/
│   │   │   └── scim.e2e-spec.ts
│   │   ├── Dockerfile
│   │   └── project.json
│   │
│   ├── webhook-service/                     # NestJS — Webhook Delivery (BullMQ)
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   ├── webhooks/
│   │   │   │   ├── webhooks.module.ts
│   │   │   │   ├── webhook-endpoints.controller.ts   # CRUD webhook endpoints
│   │   │   │   ├── webhook-endpoints.service.ts
│   │   │   │   ├── webhook.processor.ts              # @Processor('webhooks') — BullMQ worker
│   │   │   │   ├── webhook.producer.ts               # Enqueue delivery jobs from events
│   │   │   │   ├── webhook-signature.service.ts      # HMAC-SHA256 payload signing
│   │   │   │   └── dto/
│   │   │   │       ├── create-endpoint.dto.ts
│   │   │   │       └── webhook-payload.dto.ts
│   │   │   ├── events/
│   │   │   │   ├── events.module.ts
│   │   │   │   └── event-listener.service.ts         # NATS/Kafka consumer → webhook trigger
│   │   │   └── shared/
│   │   │       └── prisma/
│   │   │           ├── prisma.module.ts
│   │   │           └── prisma.service.ts
│   │   ├── prisma/
│   │   │   └── schema.prisma
│   │   ├── Dockerfile
│   │   └── project.json
│   │
│   ├── audit-service/                       # NestJS — Audit Log Ingestion & Query
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   ├── audit/
│   │   │   │   ├── audit.module.ts
│   │   │   │   ├── audit.controller.ts          # GET /audit-logs (paginated, filtered)
│   │   │   │   ├── audit.service.ts             # Query with tenant_id + action + date range
│   │   │   │   ├── audit-ingestion.service.ts   # NATS/Kafka consumer → audit_logs INSERT
│   │   │   │   ├── audit-export.service.ts      # CSV/JSON export for compliance
│   │   │   │   └── dto/
│   │   │   │       ├── query-audit.dto.ts       # Filters: actor, action, resource, date range
│   │   │   │       └── audit-entry.dto.ts
│   │   │   └── shared/
│   │   │       └── prisma/
│   │   │           ├── prisma.module.ts
│   │   │           └── prisma.service.ts
│   │   ├── prisma/
│   │   │   └── schema.prisma
│   │   ├── Dockerfile
│   │   └── project.json
│   │
│   ├── developer-portal-api/                # NestJS — API Key Management, SDK Docs
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   ├── api-keys/
│   │   │   │   ├── api-keys.module.ts
│   │   │   │   ├── api-keys.controller.ts
│   │   │   │   ├── api-keys.service.ts
│   │   │   │   └── dto/
│   │   │   │       ├── create-api-key.dto.ts
│   │   │   │       └── api-key-response.dto.ts
│   │   │   ├── oauth-apps/                  # Developer-facing OAuth client registration
│   │   │   │   ├── oauth-apps.module.ts
│   │   │   │   ├── oauth-apps.controller.ts
│   │   │   │   ├── oauth-apps.service.ts
│   │   │   │   └── dto/
│   │   │   │       ├── register-app.dto.ts
│   │   │   │       └── rotate-secret.dto.ts
│   │   │   ├── usage/                       # API key usage analytics
│   │   │   │   ├── usage.module.ts
│   │   │   │   ├── usage.controller.ts
│   │   │   │   └── usage.service.ts
│   │   │   └── shared/
│   │   │       └── prisma/
│   │   │           ├── prisma.module.ts
│   │   │           └── prisma.service.ts
│   │   ├── prisma/
│   │   │   └── schema.prisma
│   │   ├── Dockerfile
│   │   └── project.json
│   │
│   │── ── ANGULAR APPLICATIONS (Frontend) ──
│   │
│   ├── admin-console/                       # Angular 18+ — Organization Admin Dashboard
│   │   ├── src/
│   │   │   ├── main.ts                      # bootstrapApplication()
│   │   │   ├── app/
│   │   │   │   ├── app.component.ts         # Root: sidebar nav + router-outlet
│   │   │   │   ├── app.config.ts            # provideRouter, provideHttpClient, interceptors
│   │   │   │   ├── app.routes.ts            # Lazy routes with authGuard
│   │   │   │   ├── layout/
│   │   │   │   │   ├── sidebar/
│   │   │   │   │   │   └── sidebar.component.ts
│   │   │   │   │   ├── header/
│   │   │   │   │   │   └── header.component.ts
│   │   │   │   │   └── layout.component.ts  # Shell: sidebar + header + content area
│   │   │   │   ├── dashboard/
│   │   │   │   │   └── dashboard.component.ts    # Org overview, stats, quick actions
│   │   │   │   ├── members/
│   │   │   │   │   ├── members.component.ts      # Member list, invite, role management
│   │   │   │   │   ├── member-detail.component.ts
│   │   │   │   │   └── invite-dialog.component.ts
│   │   │   │   ├── groups/
│   │   │   │   │   ├── groups.component.ts       # Group list, create, nest
│   │   │   │   │   ├── group-detail.component.ts
│   │   │   │   │   └── group-members.component.ts
│   │   │   │   ├── applications/
│   │   │   │   │   ├── apps.component.ts         # OAuth client list
│   │   │   │   │   ├── app-detail.component.ts   # Client config, secrets, redirect URIs
│   │   │   │   │   └── app-create.component.ts
│   │   │   │   ├── identity-providers/
│   │   │   │   │   ├── idp-list.component.ts
│   │   │   │   │   ├── saml-setup.component.ts   # SAML metadata upload, attribute mapping
│   │   │   │   │   └── oidc-setup.component.ts
│   │   │   │   ├── resources/
│   │   │   │   │   ├── folders.component.ts
│   │   │   │   │   ├── documents.component.ts
│   │   │   │   │   └── share-dialog.component.ts # ReBAC: assign viewer/editor/commenter
│   │   │   │   ├── settings/
│   │   │   │   │   ├── settings.component.ts     # Tenant settings, branding
│   │   │   │   │   ├── security-policy.component.ts  # Password policy, MFA, session limits
│   │   │   │   │   ├── feature-flags.component.ts
│   │   │   │   │   └── webhooks.component.ts
│   │   │   │   ├── audit-log/
│   │   │   │   │   └── audit-log.component.ts    # Searchable audit log viewer
│   │   │   │   └── scim/
│   │   │   │       └── scim-config.component.ts  # SCIM token generation, endpoint display
│   │   │   ├── environments/
│   │   │   │   ├── environment.ts
│   │   │   │   └── environment.prod.ts
│   │   │   ├── assets/
│   │   │   └── styles.css                   # Tailwind CSS entry
│   │   ├── tailwind.config.js
│   │   ├── tsconfig.app.json
│   │   └── project.json
│   │
│   ├── login-portal/                        # Angular 18+ — Login, MFA, Consent, Password Reset
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app/
│   │   │   │   ├── app.component.ts
│   │   │   │   ├── app.config.ts
│   │   │   │   ├── app.routes.ts
│   │   │   │   ├── login/
│   │   │   │   │   └── login.component.ts        # Email/password + SSO redirect
│   │   │   │   ├── mfa/
│   │   │   │   │   ├── mfa-challenge.component.ts # TOTP code entry
│   │   │   │   │   ├── mfa-webauthn.component.ts  # WebAuthn ceremony
│   │   │   │   │   └── mfa-backup.component.ts    # Backup code entry
│   │   │   │   ├── consent/
│   │   │   │   │   └── consent.component.ts       # OAuth consent screen (scopes, app info)
│   │   │   │   ├── register/
│   │   │   │   │   └── register.component.ts
│   │   │   │   ├── password-reset/
│   │   │   │   │   ├── forgot-password.component.ts
│   │   │   │   │   └── reset-password.component.ts
│   │   │   │   ├── error/
│   │   │   │   │   └── error.component.ts         # OAuth error display
│   │   │   │   └── device/
│   │   │   │       └── device-auth.component.ts   # Device code flow user verification
│   │   │   ├── environments/
│   │   │   │   ├── environment.ts
│   │   │   │   └── environment.prod.ts
│   │   │   ├── assets/
│   │   │   └── styles.css
│   │   ├── tailwind.config.js
│   │   ├── tsconfig.app.json
│   │   └── project.json
│   │
│   └── developer-portal/                    # Angular 18+ — API Docs, SDK Downloads, Keys
│       ├── src/
│       │   ├── main.ts
│       │   ├── app/
│       │   │   ├── app.component.ts
│       │   │   ├── app.config.ts
│       │   │   ├── app.routes.ts
│       │   │   ├── dashboard/
│       │   │   │   └── dashboard.component.ts
│       │   │   ├── api-keys/
│       │   │   │   ├── api-keys.component.ts
│       │   │   │   └── create-key-dialog.component.ts
│       │   │   ├── oauth-apps/
│       │   │   │   ├── my-apps.component.ts
│       │   │   │   └── register-app.component.ts
│       │   │   ├── docs/
│       │   │   │   ├── api-reference.component.ts  # Swagger UI embed
│       │   │   │   ├── getting-started.component.ts
│       │   │   │   └── sdk-guides.component.ts
│       │   │   └── usage/
│       │   │       └── usage-analytics.component.ts
│       │   ├── environments/
│       │   │   ├── environment.ts
│       │   │   └── environment.prod.ts
│       │   ├── assets/
│       │   └── styles.css
│       ├── tailwind.config.js
│       ├── tsconfig.app.json
│       └── project.json
│
│
│── ─────────────────────────────────────────
│   SHARED LIBRARIES
│── ─────────────────────────────────────────
│
├── libs/
│   │
│   ├── shared-types/                        # TypeScript interfaces shared NestJS ↔ Angular
│   │   ├── src/
│   │   │   ├── index.ts                     # Barrel export
│   │   │   └── lib/
│   │   │       ├── models.ts                # User, Tenant, Membership, Session interfaces
│   │   │       ├── auth.ts                  # TokenResponse, AuthzCheckRequest/Response
│   │   │       ├── scim.ts                  # SCIMUser, SCIMGroup, SCIMListResponse
│   │   │       ├── webhook.ts               # WebhookEndpoint, WebhookDelivery, WebhookEvent
│   │   │       ├── audit.ts                 # AuditEntry, AuditQuery
│   │   │       ├── api.ts                   # PaginatedResponse<T>, ErrorResponse, ApiKey
│   │   │       └── enums.ts                 # TenantPlan, UserStatus, MembershipRole, etc.
│   │   ├── tsconfig.json
│   │   └── project.json
│   │
│   ├── ui-components/                       # Angular Tailwind component library
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   └── lib/
│   │   │       ├── button/
│   │   │       │   └── button.component.ts
│   │   │       ├── input/
│   │   │       │   └── input.component.ts
│   │   │       ├── table/
│   │   │       │   └── data-table.component.ts
│   │   │       ├── dialog/
│   │   │       │   └── dialog.component.ts
│   │   │       ├── toast/
│   │   │       │   └── toast.component.ts
│   │   │       ├── badge/
│   │   │       │   └── badge.component.ts
│   │   │       ├── avatar/
│   │   │       │   └── avatar.component.ts
│   │   │       ├── card/
│   │   │       │   └── card.component.ts
│   │   │       ├── pagination/
│   │   │       │   └── pagination.component.ts
│   │   │       └── loading/
│   │   │           └── spinner.component.ts
│   │   ├── tailwind.config.js
│   │   ├── tsconfig.json
│   │   └── project.json
│   │
│   ├── auth-guards/                         # Angular auth utilities (shared by all 3 apps)
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   └── lib/
│   │   │       ├── auth.service.ts          # Login, logout, refresh, MFA — Angular signals
│   │   │       ├── auth.interceptor.ts      # HttpInterceptorFn — attach Bearer token, handle 401
│   │   │       ├── auth.guard.ts            # CanActivateFn — redirect to login if unauthenticated
│   │   │       ├── has-permission.directive.ts  # *hasPermission structural directive (ReBAC)
│   │   │       ├── permission.service.ts    # Batch permission checks with caching
│   │   │       ├── tenant.service.ts        # Current tenant context (signal-based)
│   │   │       └── token.utils.ts           # PASETO v4.public decode (for display only)
│   │   ├── tsconfig.json
│   │   └── project.json
│   │
│   ├── nestjs-auth/                         # NestJS auth utilities (shared by all NestJS apps)
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   └── lib/
│   │   │       ├── paseto.guard.ts          # CanActivate — decrypt v4.local, attach claims
│   │   │       ├── rebac.guard.ts           # CanActivate — @RequirePermission() → OpenFGA check
│   │   │       ├── decorators/
│   │   │       │   ├── current-user.decorator.ts     # @CurrentUser() param decorator
│   │   │       │   ├── tenant-id.decorator.ts        # @TenantId() param decorator
│   │   │       │   └── require-permission.decorator.ts
│   │   │       ├── authz.service.ts         # gRPC client to authz-service (Check, WriteTuple)
│   │   │       └── authz.module.ts          # DI module for AuthzService
│   │   ├── tsconfig.json
│   │   └── project.json
│   │
│   ├── api-client/                          # Auto-generated Angular HTTP client from Swagger
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   └── lib/
│   │   │       ├── api-client.service.ts    # Generated from admin-api OpenAPI spec
│   │   │       └── models/                  # Generated request/response types
│   │   ├── openapitools.json                # openapi-generator config
│   │   ├── tsconfig.json
│   │   └── project.json
│   │
│   ├── proto/                               # Protobuf definitions (Go ↔ NestJS gRPC)
│   │   ├── authz.proto                      # AuthzService: Check, BatchCheck, ListObjects, WriteTuple
│   │   ├── identity.proto                   # Token validation, user lookup (internal)
│   │   ├── audit.proto                      # Audit event ingestion
│   │   └── buf.yaml                         # Buf schema registry config
│   │
│   ├── observability/                       # Shared tracing, metrics, logging
│   │   ├── go/
│   │   │   ├── tracing.go                   # OpenTelemetry init (OTLP → Tempo)
│   │   │   ├── metrics.go                   # Prometheus metrics registry
│   │   │   └── logger.go                    # Structured logging (zerolog/zap)
│   │   └── ts/
│   │       ├── tracing.ts                   # OpenTelemetry Node.js SDK setup
│   │       ├── metrics.ts                   # Prometheus client for NestJS
│   │       └── logger.ts                    # Pino structured logger
│   │
│   │── ── CUSTOMER SDKs ───────────────────
│   │
│   ├── sdk-node/                            # Node.js/TypeScript SDK for customers
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── client.ts                    # SSOClient class
│   │   │   ├── middleware.ts                # Express/Koa authenticate() middleware
│   │   │   ├── token.ts                     # verifyPublicToken(), decryptLocalToken()
│   │   │   └── types.ts                     # IntrospectionResult, PASETOKeySet
│   │   ├── test/
│   │   │   ├── client.test.ts
│   │   │   └── token.test.ts
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── README.md
│   │
│   └── sdk-go/                              # Go SDK for customers
│       ├── client.go                        # Client struct, VerifyPublicToken, Introspect
│       ├── middleware.go                    # Fiber/Echo/Chi middleware
│       ├── token.go                         # PASETO v4.public verify, v4.local decrypt
│       ├── types.go                         # IntrospectionResult, PASETOKey
│       ├── client_test.go
│       ├── go.mod
│       └── README.md
│
│
│── ─────────────────────────────────────────
│   OPENFGA AUTHORIZATION MODEL
│── ─────────────────────────────────────────
│
├── openfga/
│   ├── model.fga                            # Primary authorization model (DSL format)
│   ├── model.json                           # JSON representation (for API uploads)
│   ├── store.fga.yaml                       # OpenFGA store config (conditions, type restrictions)
│   ├── tests/
│   │   ├── organization.tests.yaml          # Tuple test cases for org permissions
│   │   ├── group.tests.yaml                 # Nested group inheritance tests
│   │   ├── folder-document.tests.yaml       # Folder hierarchy permission tests
│   │   ├── application.tests.yaml           # App-level RBAC tests
│   │   └── feature-flag.tests.yaml
│   ├── migrations/                          # Versioned model changes
│   │   ├── 001_initial_model.fga
│   │   ├── 002_add_commenter_role.fga
│   │   └── 003_add_api_resource_type.fga
│   └── scripts/
│       ├── validate.sh                      # Run openfga model validate
│       ├── test.sh                          # Run openfga model test (all .tests.yaml)
│       └── migrate.sh                       # Apply model to a specific store
│
│
│── ─────────────────────────────────────────
│   DATABASE
│── ─────────────────────────────────────────
│
├── database/
│   ├── schema/
│   │   ├── database-schema-v2.sql           # Full production schema (29 tables)
│   │   └── seed/
│   │       ├── dev-seed.sql                 # Dev environment sample data
│   │       ├── test-seed.sql                # Integration test fixtures
│   │       └── webhook-event-types.sql      # Reference data: all webhook event types
│   ├── migrations/                          # Versioned Postgres migrations (golang-migrate format)
│   │   ├── 000001_init_extensions.up.sql    # pgcrypto, citext, btree_gist, pg_trgm
│   │   ├── 000001_init_extensions.down.sql
│   │   ├── 000002_create_enums.up.sql
│   │   ├── 000002_create_enums.down.sql
│   │   ├── 000003_core_identity.up.sql      # tenants, users, memberships, passwords
│   │   ├── 000003_core_identity.down.sql
│   │   ├── 000004_auth_mfa.up.sql           # mfa_enrollments, backup_codes, sessions
│   │   ├── 000004_auth_mfa.down.sql
│   │   ├── 000005_oauth2.up.sql             # oauth_clients, secrets, consents, tokens
│   │   ├── 000005_oauth2.down.sql
│   │   ├── 000006_identity_providers.up.sql # identity_providers, federated_identities
│   │   ├── 000006_identity_providers.down.sql
│   │   ├── 000007_groups.up.sql             # groups, group_memberships, group_nesting
│   │   ├── 000007_groups.down.sql
│   │   ├── 000008_resources.up.sql          # folders, documents, api_resources, feature_flags
│   │   ├── 000008_resources.down.sql
│   │   ├── 000009_webhooks.up.sql           # webhook_endpoints, webhook_deliveries (partitioned)
│   │   ├── 000009_webhooks.down.sql
│   │   ├── 000010_audit_logs.up.sql         # audit_logs (partitioned) + REVOKE permissions
│   │   ├── 000010_audit_logs.down.sql
│   │   ├── 000011_developer_portal.up.sql   # api_keys, api_key_usage, scim_tokens, scim_sync_log
│   │   ├── 000011_developer_portal.down.sql
│   │   ├── 000012_authz_outbox.up.sql       # authz_outbox + permission_cache (ReBAC sync)
│   │   ├── 000012_authz_outbox.down.sql
│   │   ├── 000013_indexes.up.sql            # All 55+ indexes (partial, BRIN, GIN, trigram)
│   │   ├── 000013_indexes.down.sql
│   │   ├── 000014_rls_policies.up.sql       # RLS enable + 14 tenant policies
│   │   ├── 000014_rls_policies.down.sql
│   │   ├── 000015_views.up.sql              # Read-model views
│   │   └── 000015_views.down.sql
│   ├── partitions/
│   │   ├── create-monthly.sh                # Cron script: create next month's partitions
│   │   └── archive-old.sh                   # Detach → dump → S3 → drop old partitions
│   └── scripts/
│       ├── migrate.sh                       # Run golang-migrate up/down
│       ├── reset-dev.sh                     # Drop + recreate dev database
│       └── backup.sh                        # pg_dump with compression
│
│
│── ─────────────────────────────────────────
│   INFRASTRUCTURE
│── ─────────────────────────────────────────
│
├── infra/
│   ├── terraform/                           # AWS infrastructure as code
│   │   ├── main.tf                          # Root module: VPC, EKS, RDS, ElastiCache
│   │   ├── variables.tf
│   │   ├── outputs.tf
│   │   ├── versions.tf                      # Provider version constraints
│   │   ├── environments/
│   │   │   ├── dev.tfvars
│   │   │   ├── staging.tfvars
│   │   │   └── prod.tfvars
│   │   └── modules/
│   │       ├── vpc/                         # VPC: 3 AZs, public/private subnets, NAT
│   │       ├── eks/                         # EKS v1.29: general + authz node groups
│   │       ├── rds/                         # PostgreSQL 16: multi-AZ, 3 read replicas
│   │       ├── elasticache/                 # Redis 7.0: 6-node cluster
│   │       ├── openfga/                     # OpenFGA ECS/EKS deployment
│   │       ├── secrets-manager/             # AWS Secrets Manager for PASETO keys
│   │       ├── s3/                          # Audit log archives, SAML certs, backups
│   │       ├── waf/                         # WAF rules (OWASP Top 10)
│   │       └── monitoring/                  # CloudWatch, Prometheus remote write
│   │
│   ├── kubernetes/                          # Kubernetes manifests (or Helm charts)
│   │   ├── base/                            # Kustomize base
│   │   │   ├── namespace.yaml
│   │   │   ├── network-policies.yaml        # Service mesh rules, deny-all default
│   │   │   └── resource-quotas.yaml
│   │   ├── identity-service/
│   │   │   ├── deployment.yaml
│   │   │   ├── service.yaml
│   │   │   ├── hpa.yaml                     # HPA: 3-20 replicas, 70% CPU
│   │   │   └── configmap.yaml
│   │   ├── authz-service/
│   │   │   ├── deployment.yaml              # 3 replicas, liveness/readiness probes
│   │   │   ├── service.yaml                 # ClusterIP: 8080 (HTTP), 50051 (gRPC)
│   │   │   └── hpa.yaml
│   │   ├── sso-service/
│   │   │   ├── deployment.yaml
│   │   │   ├── service.yaml
│   │   │   └── hpa.yaml
│   │   ├── admin-api/
│   │   │   ├── deployment.yaml
│   │   │   ├── service.yaml
│   │   │   └── hpa.yaml
│   │   ├── directory-service/
│   │   │   ├── deployment.yaml
│   │   │   ├── service.yaml
│   │   │   └── hpa.yaml
│   │   ├── webhook-service/
│   │   │   ├── deployment.yaml
│   │   │   ├── service.yaml
│   │   │   └── hpa.yaml
│   │   ├── audit-service/
│   │   │   ├── deployment.yaml
│   │   │   ├── service.yaml
│   │   │   └── hpa.yaml
│   │   ├── developer-portal-api/
│   │   │   ├── deployment.yaml
│   │   │   ├── service.yaml
│   │   │   └── hpa.yaml
│   │   ├── openfga/
│   │   │   ├── deployment.yaml              # OpenFGA server: HTTP 8080, gRPC 8081, metrics 2112
│   │   │   ├── service.yaml
│   │   │   ├── hpa.yaml
│   │   │   └── migration-job.yaml           # One-shot: openfga migrate --datastore-engine postgres
│   │   ├── ingress/
│   │   │   ├── ingress.yaml                 # NGINX Ingress: host-based routing
│   │   │   ├── tls-certificate.yaml         # cert-manager ClusterIssuer (Let's Encrypt)
│   │   │   └── rate-limit-annotations.yaml
│   │   ├── monitoring/
│   │   │   ├── prometheus/
│   │   │   │   ├── prometheus.yaml
│   │   │   │   ├── service-monitors.yaml    # Per-service scrape configs
│   │   │   │   └── alerting-rules.yaml      # P1/P2 alerts: error rate, latency, auth failures
│   │   │   ├── grafana/
│   │   │   │   ├── grafana.yaml
│   │   │   │   └── dashboards/
│   │   │   │       ├── auth-overview.json
│   │   │   │       ├── openfga-metrics.json
│   │   │   │       ├── tenant-usage.json
│   │   │   │       └── slo-dashboard.json
│   │   │   ├── tempo/
│   │   │   │   └── tempo.yaml               # Distributed tracing backend
│   │   │   └── loki/
│   │   │       └── loki.yaml                # Log aggregation
│   │   ├── secrets/
│   │   │   ├── external-secrets.yaml        # ExternalSecrets operator → AWS Secrets Manager
│   │   │   └── sealed-secrets.yaml          # Alternative: Bitnami Sealed Secrets
│   │   └── overlays/                        # Kustomize overlays per environment
│   │       ├── dev/
│   │       │   └── kustomization.yaml
│   │       ├── staging/
│   │       │   └── kustomization.yaml
│   │       └── prod/
│   │           └── kustomization.yaml
│   │
│   └── docker/
│       ├── docker-compose.yml               # Local dev: Postgres, Redis, OpenFGA, NATS, Tempo
│       ├── docker-compose.override.yml      # Dev overrides (hot reload, debug ports)
│       ├── docker-compose.test.yml          # CI: ephemeral containers for integration tests
│       ├── openfga/
│       │   └── Dockerfile                   # Custom OpenFGA image with migration baked in
│       └── postgres/
│           └── init.sql                     # Dev DB init: create roles, databases, extensions
│
│
│── ─────────────────────────────────────────
│   CI/CD
│── ─────────────────────────────────────────
│
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                           # On PR: lint, test, build (Nx affected)
│   │   ├── cd-staging.yml                   # On merge to main → deploy staging (ArgoCD sync)
│   │   ├── cd-production.yml                # Manual approval → deploy prod
│   │   ├── security-scan.yml                # Snyk, Trivy container scan, SAST
│   │   ├── dependency-update.yml            # Renovate/Dependabot PR automation
│   │   ├── openfga-model-test.yml           # On openfga/ changes: validate + test model
│   │   └── db-migration-check.yml           # On database/ changes: dry-run migrations
│   ├── CODEOWNERS                           # Per-path review requirements
│   └── pull_request_template.md
│
├── .argocd/
│   ├── app-of-apps.yaml                     # ArgoCD Application-of-Applications pattern
│   └── applications/
│       ├── identity-service.yaml
│       ├── authz-service.yaml
│       ├── sso-service.yaml
│       ├── admin-api.yaml
│       ├── directory-service.yaml
│       ├── webhook-service.yaml
│       ├── audit-service.yaml
│       ├── developer-portal-api.yaml
│       └── openfga.yaml
│
│
│── ─────────────────────────────────────────
│   TESTING
│── ─────────────────────────────────────────
│
├── testing/
│   ├── integration/
│   │   ├── auth-flow.test.ts                # Full login → token → refresh → revoke flow
│   │   ├── scim-provisioning.test.ts        # SCIM create → update → delete user lifecycle
│   │   ├── oauth2-flow.test.ts              # Authorization code + PKCE end-to-end
│   │   ├── saml-login.test.ts               # SAML assertion → session creation
│   │   ├── rebac-permissions.test.ts        # Tuple write → check → inheritance verification
│   │   ├── webhook-delivery.test.ts         # Event → webhook endpoint → delivery confirmation
│   │   └── helpers/
│   │       ├── test-db.ts                   # Spin up test Postgres container
│   │       ├── test-openfga.ts              # Spin up test OpenFGA + load model
│   │       └── test-fixtures.ts             # Factory functions for test data
│   ├── e2e/
│   │   ├── cypress/                         # Cypress E2E for Angular apps
│   │   │   ├── cypress.config.ts
│   │   │   ├── e2e/
│   │   │   │   ├── login.cy.ts
│   │   │   │   ├── admin-members.cy.ts
│   │   │   │   ├── admin-groups.cy.ts
│   │   │   │   ├── admin-settings.cy.ts
│   │   │   │   └── developer-portal.cy.ts
│   │   │   ├── fixtures/
│   │   │   └── support/
│   │   │       ├── commands.ts
│   │   │       └── e2e.ts
│   │   └── playwright/                      # Alternative: Playwright for cross-browser
│   │       ├── playwright.config.ts
│   │       └── tests/
│   ├── load/
│   │   ├── k6/                              # k6 load tests
│   │   │   ├── login-flow.js               # 10K concurrent logins
│   │   │   ├── permission-check.js         # 50K rps OpenFGA checks
│   │   │   ├── token-refresh.js            # 30K rps token rotation
│   │   │   └── scim-bulk.js               # 1K concurrent SCIM provisions
│   │   └── results/                         # Load test result archives
│   └── security/
│       ├── owasp-zap.yaml                   # OWASP ZAP scan config
│       └── nuclei-templates/                # Custom Nuclei templates for SSO-specific checks
│
│
│── ─────────────────────────────────────────
│   DOCUMENTATION
│── ─────────────────────────────────────────
│
├── docs/
│   ├── architecture/
│   │   ├── system-overview.md               # High-level architecture diagram
│   │   ├── data-flow.md                     # Request flow: Angular → NestJS → Go → OpenFGA
│   │   ├── rebac-model.md                   # OpenFGA model explanation + tuple examples
│   │   ├── token-lifecycle.md               # PASETO v4 mint → validate → refresh → revoke
│   │   └── adr/                             # Architecture Decision Records
│   │       ├── 001-paseto-over-jwt.md
│   │       ├── 002-openfga-for-authz.md
│   │       ├── 003-go-fiber-for-auth.md
│   │       ├── 004-typeid-for-pks.md
│   │       └── 005-transactional-outbox.md
│   ├── api/
│   │   ├── openapi-admin.yaml               # Auto-generated from NestJS @ApiProperty decorators
│   │   ├── openapi-developer.yaml
│   │   └── scim-spec.yaml                   # SCIM 2.0 API documentation
│   ├── runbooks/
│   │   ├── incident-response.md
│   │   ├── partition-management.md
│   │   ├── openfga-model-migration.md
│   │   ├── key-rotation.md                  # PASETO key rotation procedure
│   │   └── tenant-onboarding.md
│   ├── compliance/
│   │   ├── soc2-controls.md
│   │   ├── gdpr-data-map.md
│   │   └── security-checklist.md
│   └── development/
│       ├── getting-started.md               # Dev environment setup
│       ├── coding-standards.md
│       ├── testing-guide.md
│       └── deployment-guide.md
│
│
│── ─────────────────────────────────────────
│   TOOLING & SCRIPTS
│── ─────────────────────────────────────────
│
├── tools/
│   ├── generators/                          # Custom Nx generators
│   │   ├── nest-module/                     # Scaffold NestJS module with DTO + tests
│   │   │   ├── index.ts
│   │   │   └── files/
│   │   ├── go-handler/                      # Scaffold Go handler + test + route registration
│   │   │   ├── index.ts
│   │   │   └── files/
│   │   └── angular-page/                    # Scaffold Angular page component + route + guard
│   │       ├── index.ts
│   │       └── files/
│   └── scripts/
│       ├── generate-api-client.sh           # openapi-generator from NestJS Swagger → Angular client
│       ├── generate-proto.sh                # protoc → Go + TypeScript stubs
│       ├── setup-dev.sh                     # Full dev environment bootstrap
│       ├── rotate-paseto-keys.sh            # Key rotation script
│       └── create-tenant.sh                 # CLI: provision tenant + OpenFGA store + seed data
│
│
└── README.md                                # Project overview, quick start, architecture links
```

---

## Service-to-Table Ownership Matrix

Each service owns specific database tables and is the only writer for those tables. This prevents cross-service coupling at the data layer.

| Service | Owned Tables | OpenFGA Types |
|---|---|---|
| **identity-service** (Go) | `users`, `password_history`, `sessions`, `mfa_enrollments`, `mfa_backup_codes`, `token_deny_list`, `refresh_token_families` | `user` |
| **authz-service** (Go) | `authz_outbox`, `permission_cache` | All types (tuple writes) |
| **sso-service** (Go) | `oauth_clients`, `oauth_client_secrets`, `user_consents`, `federated_identities` | `application` |
| **admin-api** (NestJS) | `tenants`, `tenant_policies`, `memberships`, `folders`, `documents`, `api_resources`, `feature_flags` | `organization`, `folder`, `document`, `api_resource`, `feature_flag` |
| **directory-service** (NestJS) | `groups`, `group_memberships`, `group_nesting`, `identity_providers`, `scim_tokens`, `scim_sync_log` | `group` |
| **webhook-service** (NestJS) | `webhook_endpoints`, `webhook_deliveries`, `webhook_event_types` | — |
| **audit-service** (NestJS) | `audit_logs` | — |
| **developer-portal-api** (NestJS) | `api_keys`, `api_key_usage` | — |

---

## Build Phase Mapping

Each folder maps to a delivery phase from the architecture guide.

| Phase | Weeks | Services / Folders Built |
|---|---|---|
| **Phase 1: Foundation** | 1–4 | `identity-service`, `admin-api` (scaffold), `login-portal` (scaffold), `database/`, `libs/shared-types/`, `libs/proto/` |
| **Phase 2: Core SSO** | 5–10 | `sso-service`, `authz-service`, `openfga/`, `login-portal` (consent, MFA), `admin-api` (tenants CRUD) |
| **Phase 3: Enterprise** | 11–16 | `directory-service`, `webhook-service`, `audit-service`, `admin-console` (full), `libs/nestjs-auth/` |
| **Phase 4: Scale** | 17–22 | `infra/kubernetes/`, `infra/terraform/`, `testing/load/`, monitoring dashboards, gRPC integration |
| **Phase 5: Polish** | 23–28 | `developer-portal`, `developer-portal-api`, `libs/sdk-node/`, `libs/sdk-go/`, `libs/api-client/`, `docs/` |
| **Phase 6: Compliance** | 29–32 | `testing/security/`, `docs/compliance/`, `docs/runbooks/`, SOC 2 controls |

---

## Key Design Decisions

**Why Go services have `internal/` but NestJS uses `src/`:** Go's `internal/` directory is enforced by the compiler — packages under `internal/` can only be imported by code in the parent directory. This prevents other Go services from accidentally importing identity-service's internals. NestJS doesn't have this language-level enforcement, so module boundaries are maintained via Nx dependency constraints in `nx.json`.

**Why database migrations live in `database/` (not per-service):** All services share one Postgres database (multi-tenancy via RLS, not per-service databases). A single migration timeline prevents ordering conflicts and ensures referential integrity across tables owned by different services.

**Why `openfga/` is top-level:** The authorization model spans all services. Moving it under one service would imply ownership by that service, but the model defines types for identity, groups, folders, documents, and apps — owned by different teams. Top-level placement signals shared ownership.

**Why Angular libraries are in `libs/` (not inside apps):** The three Angular apps (`admin-console`, `login-portal`, `developer-portal`) share auth logic, UI components, and API clients. Nx libraries with `project.json` boundaries enable tree-shaking — each app only bundles the library code it imports.
