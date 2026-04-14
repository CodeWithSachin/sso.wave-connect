#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODEL_DIR="$(dirname "$SCRIPT_DIR")"

echo "==> Running OpenFGA model tests..."
fga model test --tests "$MODEL_DIR/store.fga.yaml"

echo ""
echo "✅ All tests passed."
