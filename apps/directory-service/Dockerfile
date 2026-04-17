# Build stage
FROM node:22-alpine AS builder

RUN corepack enable pnpm

WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/directory-service/package.json apps/directory-service/
COPY libs/ libs/
RUN pnpm install --frozen-lockfile --filter @sso-platform/directory-service...

COPY apps/directory-service/ apps/directory-service/
COPY nx.json tsconfig.base.json ./
RUN npx nx build directory-service --skip-sync

# Runtime stage
FROM node:22-alpine

RUN adduser -D -u 1001 appuser
WORKDIR /app

COPY --from=builder /workspace/apps/directory-service/dist ./dist
COPY --from=builder /workspace/node_modules ./node_modules

USER appuser
EXPOSE 3200

CMD ["node", "dist/main.js"]
