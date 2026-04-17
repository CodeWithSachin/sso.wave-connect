# 09 - Local Development Setup

Step-by-step guide for getting the WaveConnect SSO platform running on your machine. Follow this from top to bottom on a fresh checkout.

---

## Prerequisites

Install these before you begin:

| Tool            | Version  | Why                                                        | Install                                  |
|-----------------|----------|------------------------------------------------------------|------------------------------------------|
| Node.js         | 24+      | Required for `--env-file` support used in scripts          | https://nodejs.org                       |
| Go              | 1.23+    | Three backend services are written in Go                   | https://go.dev/dl                        |
| pnpm            | latest   | Package manager used by this monorepo                      | `npm install -g pnpm`                    |
| Docker Desktop  | latest   | Runs PostgreSQL, Redis, NATS, and OpenFGA                  | https://www.docker.com/products/docker-desktop |

Verify everything is installed:

```bash
node --version    # v24.x.x
go version        # go1.23.x
pnpm --version    # 9.x.x or later
docker --version  # Docker version 27.x.x
```

---

## Step-by-Step Setup

### 1. Clone the repository

```bash
git clone https://github.com/CodeWithSachin/sso.wave-connect.git
cd sso.wave-connect
```

### 2. Install dependencies

```bash
pnpm install
```

This installs Node.js dependencies for all apps and libraries in the Nx workspace.

### 3. Start infrastructure services

```bash
cd infra/docker
docker-compose up -d
```

This starts five containers:

| Container          | Port(s)          | Purpose                              |
|--------------------|------------------|--------------------------------------|
| `sso-postgres`     | 5433 (host)      | PostgreSQL 16 database               |
| `sso-redis`        | 6379             | Redis 7 for caching and rate limits  |
| `sso-nats`         | 4222, 8222       | NATS JetStream message broker        |
| `sso-openfga`      | 8080, 8081, 2112 | OpenFGA authorization engine         |
| `sso-openfga-migrate` | (exits after run) | Runs OpenFGA DB migrations        |

Verify they are healthy:

```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

All containers should show `(healthy)` status within 30 seconds.

**Quick connectivity checks:**

```bash
# PostgreSQL
psql -h localhost -p 5433 -U postgres -d sso_dev -c "SELECT 1;"
# Password: postgres

# Redis
redis-cli ping
# Should return: PONG

# NATS
curl -s http://localhost:8222/healthz
# Should return: ok

# OpenFGA
curl -s http://localhost:8080/healthz
```

### 4. Create the .env file

Create a `.env` file at the project root. The `serve:all` script exports these variables before starting services.

```bash
cat > .env << 'EOF'
# ---- Database ----
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/sso_dev?schema=public

# ---- Redis ----
REDIS_URL=redis://localhost:6379

# ---- NATS ----
NATS_URL=nats://localhost:4222

# ---- OpenFGA ----
OPENFGA_API_URL=http://localhost:8080

# ---- NestJS Service Ports (optional, these are defaults) ----
ADMIN_API_PORT=3100
DIRECTORY_SERVICE_PORT=3200
WEBHOOK_SERVICE_PORT=3300
AUDIT_SERVICE_PORT=3400
DEVELOPER_PORTAL_API_PORT=3500
EOF
```

### 5. Run database migrations

The project has multiple Prisma schemas for different services. Each needs its own migration push.

```bash
# Admin API schema (tenants, users, groups, memberships, policies, IdPs)
cd apps/admin-api
npx prisma db push
cd ../..

# Developer Portal API schema (api_keys, oauth_apps, scim_tokens, etc.)
cd apps/developer-portal-api
npx prisma db push
cd ../..

# Audit Service schema
cd apps/audit-service
npx prisma db push
cd ../..

# Webhook Service schema
cd apps/webhook-service
npx prisma db push
cd ../..

# Directory Service schema
cd apps/directory-service
npx prisma db push
cd ../..
```

> **Tip:** If you want to see the SQL that would run without applying it, use `npx prisma db push --dry-run`.

### 6. Start all services

```bash
pnpm serve:all
```

This starts all 11 services in parallel using Nx. You should see startup logs for each service in the terminal.

### 7. Verify services are running

| Service              | URL / Port                     | Check                                 |
|----------------------|-------------------------------|---------------------------------------|
| Login Portal         | http://localhost:4300         | Open in browser                       |
| Admin Console        | http://localhost:4301         | Open in browser                       |
| Developer Portal     | http://localhost:4302         | Open in browser                       |
| Admin API            | http://localhost:3100/docs    | Swagger UI                            |
| Directory Service    | http://localhost:3200/docs    | Swagger UI                            |
| Webhook Service      | http://localhost:3300/docs    | Swagger UI                            |
| Audit Service        | http://localhost:3400/docs    | Swagger UI                            |
| Developer Portal API | http://localhost:3500/docs    | Swagger UI                            |
| Identity Service     | http://localhost:3000         | Go service (health endpoint)          |
| AuthZ Service        | http://localhost:8082         | Go service (health endpoint)          |
| SSO Service          | http://localhost:8083         | Go service (health endpoint)          |

---

## NPM Scripts

All scripts are defined in the root `package.json`:

| Script              | Command               | What it does                         |
|---------------------|-----------------------|--------------------------------------|
| `pnpm serve:all`    | Starts all 11 services in parallel | Frontend apps + all backends |
| `pnpm serve:frontend` | Starts 3 Angular apps | login-portal, admin-console, developer-portal |
| `pnpm serve:backend` | Starts 8 backend services | Both NestJS APIs + Go services + supporting NestJS services |
| `pnpm build:all`    | Builds everything     | Production builds for all projects   |
| `pnpm lint:all`     | Lints everything      | ESLint across all projects           |
| `pnpm test:all`     | Tests everything      | Unit tests across all projects       |

---

## Nx Commands

This is an Nx monorepo. Common commands:

```bash
# Serve a single project
pnpm nx serve admin-api
pnpm nx serve login-portal

# Build a single project
pnpm nx build admin-api

# Serve multiple specific projects
pnpm nx run-many --target=serve --projects=admin-api,admin-console --parallel=2

# List all projects in the workspace
pnpm nx show projects

# Show a project's configuration (targets, executor, etc.)
pnpm nx show project admin-api --json

# Visualize the dependency graph (opens in browser)
pnpm nx graph

# Run only affected tasks (based on git changes)
pnpm nx affected --target=test
pnpm nx affected --target=lint
```

---

## Go Services Configuration

The three Go services (identity-service, authz-service, sso-service) each have a `config.yaml` in their app directory:

```
apps/identity-service/config.yaml
apps/authz-service/config.yaml
apps/sso-service/config.yaml
```

These files are read by [Viper](https://github.com/spf13/viper). Environment variables override config file values. Example from `sso-service/config.yaml`:

```yaml
server:
  port: 8083
  read_timeout: 10s
  write_timeout: 10s

database:
  url: "postgres://app_readwrite:dev@localhost:5433/sso_dev?sslmode=disable"
  max_conns: 20

redis:
  url: "redis://localhost:6379/2"

token:
  symmetric_key_hex: "..."
  private_key_hex: "..."
  issuer: "http://localhost:8083"
  access_ttl: 15m
  refresh_ttl: 720h
  id_ttl: 1h
```

To override a value with an environment variable, use the path with underscores. For example, `SERVER_PORT=9090` overrides `server.port`.

---

## Project Structure Quick Reference

```
sso.wave-connect/
  apps/
    login-portal/          # Angular -- :4200
    admin-console/         # Angular -- :4300
    developer-portal/      # Angular -- :4400
    admin-api/             # NestJS  -- :3100 (tenant/user/group/membership/policy/IdP CRUD)
    developer-portal-api/  # NestJS  -- :3500 (API keys, OAuth apps, SCIM tokens, docs)
    directory-service/     # NestJS  -- :3200 (SCIM provisioning)
    webhook-service/       # NestJS  -- :3300 (webhook delivery)
    audit-service/         # NestJS  -- :3400 (audit log storage)
    identity-service/      # Go     -- :3000 (user authentication, password/MFA)
    authz-service/         # Go     -- :8082 (OpenFGA ReBAC authorization)
    sso-service/           # Go     -- :8083 (OAuth2/OIDC, PASETO token issuance)
  libs/                    # Shared libraries (Angular components, NestJS modules)
  infra/docker/            # Docker Compose for infrastructure
  database/                # Database scripts and seeds
  openfga/                 # OpenFGA authorization model definitions
  packages/                # Publishable packages
```

---

## Common Issues and Troubleshooting

### Port already in use

```bash
# Find and kill the process on a specific port
lsof -ti :3100 | xargs kill -9

# Or check what is using the port
lsof -i :3100
```

### DATABASE_URL not set

The `serve:all` and `serve:backend` scripts load `.env` automatically using `export $(grep -v '^#' .env | xargs)`. If you see database connection errors:

1. Make sure `.env` exists at the project root (not in an app directory).
2. Verify the `DATABASE_URL` points to the correct host and port (5433, not 5432).
3. Make sure the Docker containers are running: `docker ps`.

### Prisma schema out of sync

If you see errors about missing columns or tables:

```bash
cd apps/admin-api
npx prisma db push

# If you want to reset completely (WARNING: destroys all data):
npx prisma db push --force-reset
```

Repeat for each service that has a `prisma/` directory.

### Prisma Client not generated

If you see errors like "PrismaClient is not generated":

```bash
cd apps/admin-api
npx prisma generate
```

### CORS errors in the browser

The NestJS services are configured to allow requests from the three Angular dev servers:

```
http://localhost:4300
http://localhost:4301
http://localhost:4302
```

If you are running a frontend on a different port, update the `enableCors()` call in the relevant service's `src/main.ts` file.

### Go compile errors

```bash
# Ensure Go 1.23+
go version

# Clean and re-download dependencies
cd apps/sso-service
go mod tidy

# Same for other Go services
cd ../identity-service && go mod tidy
cd ../authz-service && go mod tidy
```

### Docker containers not starting

```bash
# Check logs for a specific container
docker logs sso-postgres

# Restart all containers
cd infra/docker
docker-compose down
docker-compose up -d

# Nuclear option: remove volumes and start fresh
docker-compose down -v
docker-compose up -d
```

### NATS connection refused

NATS runs on port 4222. If services cannot connect:

1. Verify NATS is running: `docker ps | grep nats`
2. Check monitoring endpoint: `curl http://localhost:8222/varz`
3. Ensure `NATS_URL=nats://localhost:4222` in your `.env`

### OpenFGA errors

If authorization checks fail:

1. Verify OpenFGA is healthy: `curl http://localhost:8080/healthz`
2. Make sure the migration container ran successfully: `docker logs sso-openfga-migrate`
3. Check the OpenFGA authorization model is loaded (see the `openfga/` directory at the project root)

---

## Tips for New Developers

1. **Start small.** Use `pnpm nx serve admin-api` to run a single service while you are learning. You do not need all 11 services running to work on one.

2. **Use Swagger.** Every NestJS service has Swagger docs at `/docs`. Use them to explore and test endpoints without writing any code.

3. **Check the dependency graph.** Run `pnpm nx graph` to understand how projects depend on each other. This helps you know what to rebuild when you change a shared library.

4. **Read the KT docs.** The `KT/` folder contains knowledge transfer documents covering architecture, data flow, security design, and more. Start with `01-project-overview.md`.

5. **Environment variables override config.yaml.** For Go services, any config.yaml value can be overridden by setting an environment variable with the path in uppercase and underscores (e.g., `SERVER_PORT`, `DATABASE_URL`).
