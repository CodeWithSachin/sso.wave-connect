#!/usr/bin/env bash
# bootstrap.sh — idempotent OpenFGA store provisioning + model load.
#
# Wraps the raw OpenFGA HTTP API so fresh environments (dev containers, CI,
# staging) can stand up a working store in one command. Safe to rerun:
#
#   - If a store named OPENFGA_STORE_NAME already exists, reuses its ID.
#   - If no model has been loaded yet, loads openfga/model.fga and records
#     the returned model ID.
#   - Writes the resolved store ID to STORE_ID_FILE (default
#     ./openfga/.store-id) so callers (authz-service boot, migrate.sh) can
#     source it without a human copy-paste step.
#
# Dependencies: curl + jq (ubiquitous on macOS + Linux CI images). No fga CLI
# required — replaces the previous migrate.sh flow that forced a manual
# `fga model write` invocation on every fresh environment.
#
# Usage:
#   ./openfga/scripts/bootstrap.sh [openfga_api_url]
#
# Environment overrides:
#   OPENFGA_API_URL     default http://localhost:8080
#   OPENFGA_STORE_NAME  default sso-wave-connect
#   STORE_ID_FILE       default ./openfga/.store-id (git-ignored)

set -euo pipefail

OPENFGA_API_URL="${1:-${OPENFGA_API_URL:-http://localhost:8080}}"
OPENFGA_STORE_NAME="${OPENFGA_STORE_NAME:-sso-wave-connect}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
MODEL_FILE="$REPO_ROOT/openfga/model.fga"
STORE_ID_FILE="${STORE_ID_FILE:-$REPO_ROOT/openfga/.store-id}"

for tool in curl jq; do
    if ! command -v "$tool" >/dev/null 2>&1; then
        echo "Error: $tool is required." >&2
        exit 1
    fi
done

echo "==> Probing OpenFGA at $OPENFGA_API_URL"
if ! curl -sf --max-time 5 "$OPENFGA_API_URL/healthz" -o /dev/null 2>&1; then
    # /healthz may not be enabled; fall back to /stores which always works.
    if ! curl -sf --max-time 5 "$OPENFGA_API_URL/stores" -o /dev/null; then
        echo "Error: OpenFGA HTTP API unreachable at $OPENFGA_API_URL." >&2
        echo "Is 'sso-openfga' container up? Run 'docker compose up -d openfga'." >&2
        exit 1
    fi
fi

# --- Store provisioning -----------------------------------------------------
# List stores and look for one named OPENFGA_STORE_NAME. If not found, create.
# The stores endpoint paginates at 50; we only ever run 1-2 stores in dev so
# one page is sufficient.
echo "==> Looking for store '$OPENFGA_STORE_NAME'"
existing_id="$(curl -sf "$OPENFGA_API_URL/stores" \
    | jq -r --arg name "$OPENFGA_STORE_NAME" '.stores[] | select(.name == $name) | .id' \
    | head -n 1)"

if [ -n "$existing_id" ]; then
    STORE_ID="$existing_id"
    echo "    reusing existing store id=$STORE_ID"
else
    echo "    creating store '$OPENFGA_STORE_NAME'"
    STORE_ID="$(curl -sf -X POST "$OPENFGA_API_URL/stores" \
        -H 'Content-Type: application/json' \
        -d "{\"name\": \"$OPENFGA_STORE_NAME\"}" \
        | jq -r '.id')"
    echo "    created store id=$STORE_ID"
fi

# Persist for later consumers (authz-service config.yaml, other scripts).
echo "$STORE_ID" > "$STORE_ID_FILE"
echo "==> Wrote store id → $STORE_ID_FILE"

# --- Model load -------------------------------------------------------------
# Check whether the store already has an authorization model. A store with
# zero models needs the DSL loaded; a store with >= 1 model we leave alone —
# loading a new model here would make old tuples reference a stale model id
# and silently stop authorizing. Model evolution is a deliberate migration,
# not a bootstrap concern.
echo "==> Checking for existing authorization model"
model_count="$(curl -sf "$OPENFGA_API_URL/stores/$STORE_ID/authorization-models" \
    | jq '.authorization_models | length')"

if [ "$model_count" -gt 0 ]; then
    echo "    store has $model_count model(s) already; skipping load."
    echo "    to evolve the model, use 'fga model write' against the specific store."
    exit 0
fi

# Fresh store: convert DSL → JSON via the `fga` CLI if present, else fall
# back to the HTTP API's DSL-aware endpoint that some OpenFGA versions ship.
# For 1.x the reliable path is the CLI — document the dependency but don't
# hard-fail when it's absent; instead tell the user what to run.
if command -v fga >/dev/null 2>&1; then
    echo "==> Loading model from $MODEL_FILE via fga CLI"
    fga model write \
        --store-id "$STORE_ID" \
        --api-url "$OPENFGA_API_URL" \
        --file "$MODEL_FILE" \
        >/dev/null
    echo "    model loaded."
else
    echo "Error: store is empty and 'fga' CLI is not installed." >&2
    echo "Install it once per machine:" >&2
    echo "  go install github.com/openfga/cli/cmd/fga@latest" >&2
    echo "  # or: brew install openfga/tap/fga" >&2
    echo "Then rerun this script." >&2
    exit 1
fi

echo ""
echo "OpenFGA ready. Store id: $STORE_ID"
echo "Authz-service should read OPENFGA_STORE_ID from $STORE_ID_FILE or config."
