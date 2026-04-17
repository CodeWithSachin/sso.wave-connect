# Build stage
FROM node:22-alpine AS builder

RUN corepack enable pnpm

WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/audit-service/package.json apps/audit-service/
COPY libs/ libs/
RUN pnpm install --frozen-lockfile --filter @sso-platform/audit-service...

COPY apps/audit-service/ apps/audit-service/
COPY nx.json tsconfig.base.json ./
RUN npx nx build audit-service --skip-sync

# Runtime stage
FROM node:22-alpine

RUN adduser -D -u 1001 appuser
WORKDIR /app

COPY --from=builder /workspace/apps/audit-service/dist ./dist
COPY --from=builder /workspace/node_modules ./node_modules

USER appuser
EXPOSE 3400

CMD ["node", "dist/main.js"]
