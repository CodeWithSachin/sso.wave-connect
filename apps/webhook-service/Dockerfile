# Build stage
FROM node:22-alpine AS builder

RUN corepack enable pnpm

WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/webhook-service/package.json apps/webhook-service/
COPY libs/ libs/
RUN pnpm install --frozen-lockfile --filter @sso-platform/webhook-service...

COPY apps/webhook-service/ apps/webhook-service/
COPY nx.json tsconfig.base.json ./
RUN npx nx build webhook-service --skip-sync

# Runtime stage
FROM node:22-alpine

RUN adduser -D -u 1001 appuser
WORKDIR /app

COPY --from=builder /workspace/apps/webhook-service/dist ./dist
COPY --from=builder /workspace/node_modules ./node_modules

USER appuser
EXPOSE 3300

CMD ["node", "dist/main.js"]
