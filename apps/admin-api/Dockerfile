# Build stage
FROM node:22-alpine AS builder

RUN corepack enable pnpm

WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/admin-api/package.json apps/admin-api/
COPY libs/ libs/
RUN pnpm install --frozen-lockfile --filter @sso-platform/admin-api...

COPY apps/admin-api/ apps/admin-api/
COPY nx.json tsconfig.base.json ./
RUN npx nx build admin-api --skip-sync

# Runtime stage
FROM node:22-alpine

RUN adduser -D -u 1001 appuser
WORKDIR /app

COPY --from=builder /workspace/apps/admin-api/dist ./dist
COPY --from=builder /workspace/node_modules ./node_modules

USER appuser
EXPOSE 3100

CMD ["node", "dist/main.js"]
