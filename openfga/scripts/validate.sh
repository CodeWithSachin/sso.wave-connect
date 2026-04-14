#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODEL_DIR="$(dirname "$SCRIPT_DIR")"

echo "==> Validating OpenFGA model..."
fga model validate --file "$MODEL_DIR/model.fga"

echo ""
echo "==> Validating migration models..."
for f in "$MODEL_DIR/migrations"/*.fga; do
  if [ -f "$f" ]; then
    echo "    Validating $(basename "$f")..."
    fga model validate --file "$f"
  fi
done

echo ""
echo "✅ All models are valid."
