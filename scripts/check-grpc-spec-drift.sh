#!/usr/bin/env bash
# Fail when the count of RPCs declared in libs/proto/*.proto diverges from the
# count of operations documented in docs/api/grpc/services.yaml.
#
# This is a *drift* gate, not a content check — it catches the common failure
# mode "added a new RPC, forgot to update the hand-curated gRPC reference doc".
# Run via `pnpm docs:check` or as a CI step.
#
# Exit codes:
#   0 — counts match
#   1 — drift detected; fix services.yaml or the proto
#   2 — missing files / unexpected error

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROTO_DIR="$REPO_ROOT/libs/proto"
SPEC_FILE="$REPO_ROOT/docs/api/grpc/services.yaml"

if [[ ! -d "$PROTO_DIR" ]]; then
  echo "fatal: missing proto dir at $PROTO_DIR" >&2
  exit 2
fi
if [[ ! -f "$SPEC_FILE" ]]; then
  echo "fatal: missing gRPC reference at $SPEC_FILE" >&2
  exit 2
fi

# Count `rpc <Name>(` declarations across all .proto files.
RPC_COUNT=$(grep -rhE '^[[:space:]]*rpc[[:space:]]+[A-Z][A-Za-z0-9]*\(' "$PROTO_DIR"/*.proto | wc -l | tr -d ' ')

# Count `"/grpc/...":` paths in services.yaml. Each path documents one RPC.
PATH_COUNT=$(grep -cE '^[[:space:]]+"/grpc/' "$SPEC_FILE" | tr -d ' ')

echo "proto RPCs:        $RPC_COUNT"
echo "documented paths:  $PATH_COUNT"

if [[ "$RPC_COUNT" != "$PATH_COUNT" ]]; then
  echo
  echo "❌ drift detected: libs/proto declares $RPC_COUNT RPCs but $SPEC_FILE documents $PATH_COUNT."
  echo "   Update $SPEC_FILE by hand to match (it's intentionally curated)."
  echo
  echo "RPCs declared in protos:"
  grep -rhnE '^[[:space:]]*rpc[[:space:]]+[A-Z][A-Za-z0-9]*\(' "$PROTO_DIR"/*.proto | sed 's/^/    /'
  exit 1
fi

echo "✓ gRPC reference is in sync with libs/proto"
