# Build stage
FROM node:22-alpine AS builder

RUN corepack enable pnpm

WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/login-portal/ apps/login-portal/
COPY libs/ libs/
COPY nx.json tsconfig.base.json tsconfig.json ./
RUN pnpm install --frozen-lockfile
RUN NX_IGNORE_UNSUPPORTED_TS_SETUP=true npx nx build login-portal --skip-sync

# Runtime stage
FROM nginx:1.27-alpine

RUN adduser -D -u 1001 appuser

# Copy built Angular assets
COPY --from=builder /workspace/dist/apps/login-portal/browser /usr/share/nginx/html

# SPA fallback: all routes -> index.html
RUN echo 'server { listen 80; root /usr/share/nginx/html; location / { try_files $uri $uri/ /index.html; } location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ { expires 1y; add_header Cache-Control "public, immutable"; } }' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
