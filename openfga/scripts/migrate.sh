#!/usr/bin/env bash
set -euo pipefail

# Usage: ./migrate.sh <store_id> [openfga_api_url]
# Example: ./migrate.sh 01HXYZ... http://localhost:8080

STORE_ID="${1:?Usage: migrate.sh <store_id> [openfga_api_url]}"
OPENFGA_API_URL="${2:-http://localhost:8080}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODEL_DIR="$(dirname "$SCRIPT_DIR")"

echo "==> Validating model before migration..."
fga model validate --file "$MODEL_DIR/model.fga"

echo ""
echo "==> Writing authorization model to store $STORE_ID..."
fga model write \
  --store-id "$STORE_ID" \
  --api-url "$OPENFGA_API_URL" \
  --file "$MODEL_DIR/model.fga"

echo ""
echo "✅ Model migrated successfully to store $STORE_ID."
