#!/usr/bin/env bash
# ============================================================================
# SSO Platform — Start All Services
# ============================================================================
# Usage:
#   ./scripts/start-all.sh              # Start all services
#   ./scripts/start-all.sh --no-infra   # Skip Docker infra
#   ./scripts/start-all.sh --stop       # Stop everything
# ============================================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$ROOT_DIR/.logs"
PID_FILE="$LOG_DIR/pids"
mkdir -p "$LOG_DIR"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}[sso]${NC} $1"; }
warn() { echo -e "${YELLOW}[sso]${NC} $1"; }

# ── Stop ──────────────────────────────────────────────────────────────────
stop_all() {
  log "Stopping all services..."

  # Kill tracked PIDs
  if [ -f "$PID_FILE" ]; then
    while IFS= read -r pid; do
      kill "$pid" 2>/dev/null && log "  killed PID $pid" || true
    done < "$PID_FILE"
    rm -f "$PID_FILE"
  fi

  # Kill by known ports (skip 8080 — used by Docker/OpenFGA)
  for port in 3000 8082 8083 3100 3200 3300 3400 3500 4200 4300 4400; do
    pids=$(lsof -ti:$port 2>/dev/null || true)
    if [ -n "$pids" ]; then
      echo "$pids" | xargs kill 2>/dev/null || true
    fi
  done

  log "All stopped."
  exit 0
}

[ "${1:-}" = "--stop" ] && stop_all

# ── Kill any existing processes on our ports (skip 8080 — Docker/OpenFGA) ─
log "Cleaning up existing processes..."
for port in 3000 8082 8083 3100 3200 3300 3400 3500 4200 4300 4400; do
  pids=$(lsof -ti:$port 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "$pids" | xargs kill 2>/dev/null || true
    log "  freed port $port"
  fi
done

> "$PID_FILE"

# ── Environment Variables ─────────────────────────────────────────────────
export DATABASE_URL="${DATABASE_URL:-postgres://app_readwrite:dev@localhost:5433/sso_dev?sslmode=disable}"

# ── Infrastructure ────────────────────────────────────────────────────────
if [ "${1:-}" != "--no-infra" ]; then
  log "Starting Docker infrastructure..."
  if [ -f "$ROOT_DIR/infra/docker/docker-compose.yml" ]; then
    (cd "$ROOT_DIR/infra/docker" && docker-compose up -d 2>&1 | tail -3)
  else
    warn "No docker-compose.yml found — skipping"
  fi
fi

# ── Go Services (direct go run) ──────────────────────────────────────────
start_go() {
  local name=$1 dir=$2 port=$3
  log "Starting ${BLUE}$name${NC} (Go, port $port)..."
  (cd "$ROOT_DIR/$dir" && go run ./cmd/server > "$LOG_DIR/$name.log" 2>&1) &
  echo $! >> "$PID_FILE"
}

start_go "identity-service" "apps/identity-service" 3000
start_go "authz-service"    "apps/authz-service"    8080
start_go "sso-service"      "apps/sso-service"      8082

# ── NestJS + Angular (each in its own background shell) ───────────────────
start_nx() {
  local name=$1 port=$2
  log "Starting ${BLUE}$name${NC} (Nx, port $port)..."
  (cd "$ROOT_DIR" && npx nx serve "$name" > "$LOG_DIR/$name.log" 2>&1) &
  echo $! >> "$PID_FILE"
}

# Angular apps (use Angular dev server — no Nx daemon contention)
start_nx "login-portal"       4200
start_nx "admin-console"      4300
start_nx "developer-portal"   4400

# NestJS apps (run in parallel through nx run-many)
log "Starting ${BLUE}NestJS services${NC} (building + serving)..."
(cd "$ROOT_DIR" && npx nx run-many -t serve -p admin-api,directory-service,webhook-service,audit-service,developer-portal-api --parallel=5 > "$LOG_DIR/nestjs-all.log" 2>&1) &
echo $! >> "$PID_FILE"

# ── Summary ───────────────────────────────────────────────────────────────
log ""
log "============================================"
log "  SSO Platform — All Services Starting"
log "============================================"
log ""
log "  ${BLUE}Go Services:${NC}"
log "    identity-service  http://localhost:3000"
log "    authz-service     http://localhost:8080"
log "    sso-service       http://localhost:8082"
log ""
log "  ${BLUE}NestJS APIs:${NC}"
log "    admin-api             http://localhost:3100/docs"
log "    directory-service     http://localhost:3200/docs"
log "    webhook-service       http://localhost:3300/docs"
log "    audit-service         http://localhost:3400/docs"
log "    developer-portal-api  http://localhost:3500/api/docs"
log ""
log "  ${BLUE}Frontend Apps:${NC}"
log "    login-portal       http://localhost:4200"
log "    admin-console      http://localhost:4300"
log "    developer-portal   http://localhost:4400"
log ""
log "  Logs: .logs/<service>.log"
log "  Stop: ./scripts/start-all.sh --stop"
log "============================================"
