#!/usr/bin/env bash
# reset-dev.sh — Drop, recreate, migrate, and seed the dev database
# Usage: ./reset-dev.sh
#
# WARNING: This destroys all data. Only for local development.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATABASE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SEED_FILE="$DATABASE_DIR/schema/seed/dev-seed.sql"

# Database connection — override via environment variables
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-postgres}"
DB_NAME="${DB_NAME:-sso_platform}"
DB_SSLMODE="${DB_SSLMODE:-disable}"

export PGPASSWORD="$DB_PASSWORD"

echo "============================================"
echo "  SSO Platform — Dev Database Reset"
echo "============================================"
echo ""
echo "  Host:     $DB_HOST:$DB_PORT"
echo "  Database: $DB_NAME"
echo "  User:     $DB_USER"
echo ""

# Safety check
if [ "${ALLOW_RESET:-}" != "true" ]; then
    read -r -p "This will DESTROY all data in '$DB_NAME'. Continue? (y/N): " CONFIRM
    if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
        echo "Aborted."
        exit 0
    fi
fi

echo ""
echo "[1/4] Dropping database '$DB_NAME'..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "
    SELECT pg_terminate_backend(pid)
    FROM pg_stat_activity
    WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();
" > /dev/null 2>&1 || true

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS $DB_NAME;" 2>/dev/null || true

echo "[2/4] Creating database '$DB_NAME'..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "CREATE DATABASE $DB_NAME;"

echo "[3/4] Running migrations..."
export DATABASE_URL="postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=${DB_SSLMODE}"
"$SCRIPT_DIR/migrate.sh" up

echo "[4/4] Seeding development data..."
if [ -f "$SEED_FILE" ]; then
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$SEED_FILE"
    echo "Seed data applied."
else
    echo "WARNING: Seed file not found at $SEED_FILE — skipping."
fi

echo ""
echo "============================================"
echo "  Dev database reset complete!"
echo "============================================"
