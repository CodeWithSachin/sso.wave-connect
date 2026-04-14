#!/usr/bin/env bash
# migrate.sh — Wrapper for golang-migrate CLI
# Usage:
#   ./migrate.sh up                  # Apply all pending migrations
#   ./migrate.sh up N                # Apply next N migrations
#   ./migrate.sh down                # Rollback last migration
#   ./migrate.sh down N              # Rollback last N migrations
#   ./migrate.sh drop                # Drop everything (DANGEROUS)
#   ./migrate.sh version             # Show current migration version
#   ./migrate.sh force VERSION       # Force set version (for fixing dirty state)
#   ./migrate.sh create NAME         # Create a new migration pair

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="$(cd "$SCRIPT_DIR/../migrations" && pwd)"

# Database connection — override via environment variables
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5433}"
DB_USER="${DB_USER:-app_readwrite}"
DB_PASSWORD="${DB_PASSWORD:-dev}"
DB_NAME="${DB_NAME:-sso_dev}"
DB_SSLMODE="${DB_SSLMODE:-disable}"

DATABASE_URL="${DATABASE_URL:-postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=${DB_SSLMODE}}"

# Check that migrate CLI is installed
if ! command -v migrate &> /dev/null; then
    echo "Error: golang-migrate CLI not found."
    echo "Install it with:"
    echo "  brew install golang-migrate          # macOS"
    echo "  go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest  # Go"
    exit 1
fi

ACTION="${1:-help}"
shift || true

case "$ACTION" in
    up)
        echo "Applying migrations from: $MIGRATIONS_DIR"
        if [ -n "${1:-}" ]; then
            migrate -path "$MIGRATIONS_DIR" -database "$DATABASE_URL" up "$1"
        else
            migrate -path "$MIGRATIONS_DIR" -database "$DATABASE_URL" up
        fi
        echo "Migrations applied successfully."
        ;;
    down)
        STEPS="${1:-1}"
        echo "Rolling back $STEPS migration(s)..."
        migrate -path "$MIGRATIONS_DIR" -database "$DATABASE_URL" down "$STEPS"
        echo "Rollback complete."
        ;;
    drop)
        echo "WARNING: This will drop ALL database objects."
        read -r -p "Are you sure? (type 'yes' to confirm): " CONFIRM
        if [ "$CONFIRM" = "yes" ]; then
            migrate -path "$MIGRATIONS_DIR" -database "$DATABASE_URL" drop -f
            echo "Database dropped."
        else
            echo "Aborted."
        fi
        ;;
    version)
        migrate -path "$MIGRATIONS_DIR" -database "$DATABASE_URL" version
        ;;
    force)
        VERSION="${1:?Usage: migrate.sh force VERSION}"
        echo "Forcing migration version to $VERSION..."
        migrate -path "$MIGRATIONS_DIR" -database "$DATABASE_URL" force "$VERSION"
        echo "Version set to $VERSION."
        ;;
    create)
        NAME="${1:?Usage: migrate.sh create NAME}"
        migrate create -ext sql -dir "$MIGRATIONS_DIR" -seq -digits 6 "$NAME"
        echo "Created new migration: $NAME"
        ;;
    help|*)
        echo "Usage: $0 {up|down|drop|version|force|create} [args]"
        echo ""
        echo "Commands:"
        echo "  up [N]            Apply all (or N) pending migrations"
        echo "  down [N]          Rollback last N migrations (default: 1)"
        echo "  drop              Drop everything (interactive confirm)"
        echo "  version           Show current migration version"
        echo "  force VERSION     Force set version (fix dirty state)"
        echo "  create NAME       Create a new migration pair"
        echo ""
        echo "Environment variables:"
        echo "  DATABASE_URL      Full Postgres connection string (overrides individual vars)"
        echo "  DB_HOST           Database host (default: localhost)"
        echo "  DB_PORT           Database port (default: 5432)"
        echo "  DB_USER           Database user (default: postgres)"
        echo "  DB_PASSWORD       Database password (default: postgres)"
        echo "  DB_NAME           Database name (default: sso_platform)"
        echo "  DB_SSLMODE        SSL mode (default: disable)"
        ;;
esac
