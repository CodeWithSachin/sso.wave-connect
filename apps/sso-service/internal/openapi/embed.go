package openapi

import _ "embed"

// Spec is the raw OpenAPI/Swagger document for this service. Regenerate
// with `swag init -g cmd/server/main.go -o internal/openapi` (run via the
// `openapi:export` Nx target).
//
//go:embed swagger.json
var Spec []byte
