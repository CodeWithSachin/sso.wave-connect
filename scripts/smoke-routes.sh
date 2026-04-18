#!/usr/bin/env bash
# smoke-routes.sh — Minimal route-registration smoke check for identity-service.
#
# Phase 2 review fix #15. Hits every auth-guarded endpoint without credentials
# and asserts the expected unauthenticated status. Catches regressions like
# "middleware group refactor dropped a route" — NOT a functional correctness
# test. Run after changes to route registration in cmd/server/main.go.
#
# Usage:
#   ./scripts/smoke-routes.sh [host]
# Default host: http://localhost:3000
#
# Expected codes:
#   200 — unauthenticated path that returns 200 (e.g. /healthz)
#   400 — auth'd path that also requires X-Tenant-ID and runs TenantExtraction first
#   401 — SessionCookieAuth-gated path with no cookie
#
# Exit codes:
#   0 — all assertions passed
#   1 — at least one route returned an unexpected status (probable regression)

set -uo pipefail

HOST="${1:-http://localhost:3000}"
FAIL=0

assert() {
    local name="$1" method="$2" path="$3" expected="$4"
    local got
    got=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" "${HOST}${path}")
    # `expected` may be a pipe-separated list; accept any match.
    local ok=0
    IFS='|' read -ra wants <<< "$expected"
    for w in "${wants[@]}"; do
        if [ "$got" = "$w" ]; then ok=1; break; fi
    done
    if [ "$ok" = "1" ]; then
        echo "PASS  $name  [$method $path → $got]"
    else
        echo "FAIL  $name  [$method $path → $got, expected $expected]"
        FAIL=$((FAIL + 1))
    fi
}

echo "=== identity-service route smoke ($HOST) ==="

# Health / well-known — no auth.
assert "healthz"                   GET    /healthz                                    200
# readyz returns 503 when DB/Redis haven't warmed up. Accept either.
assert "readyz"                    GET    /readyz                                     "200|503"
assert "openid-config"             GET    /.well-known/openid-configuration           200
assert "paseto-keys"               GET    /.well-known/paseto-keys                    200

# Public auth surface — validation kicks in before auth, so a bodyless POST
# returns 400 (invalid body) rather than 401. We assert that the route exists
# and doesn't 404.
assert "signup exists"             POST   /auth/public/signup                         400
assert "signup-org exists"         POST   /auth/public/signup-org                     400
assert "verify-email exists"       POST   /auth/public/verify-email                   400
# Resend always 202 on VALID body; bodyless POST still returns 400 from BodyParser.
# The 202 path is covered by a functional test, not this route smoke.
assert "resend exists"             POST   /auth/public/verify-email/resend            400

# Tenant-scoped auth endpoints — require X-Tenant-ID (TenantExtraction runs first).
assert "register needs tenant"     POST   /auth/register                              400
assert "login needs tenant"        POST   /auth/login                                 400

# Logout is tenantless (cookie-derived) — 204 even without a cookie, by design.
assert "logout idempotent"         POST   /logout                                     204

# PASETO-protected under /sessions and /auth/mfa — no token → TenantExtraction
# rejects first with 400.
assert "sessions list"             GET    /sessions                                   400
assert "sessions trailing slash"   GET    /sessions/                                  400
assert "mfa enroll"                POST   /auth/mfa/enroll                            400
assert "mfa enrollments"           GET    /auth/mfa/enrollments                       400
assert "mfa backup regenerate"     POST   /auth/mfa/backup-codes/regenerate           400
assert "webauthn reg begin"        POST   /auth/mfa/webauthn/register/begin           400
assert "webauthn login begin"      POST   /auth/mfa/webauthn/login/begin              400

# Session-cookie-protected domain endpoints — no cookie → 401.
# Fake UUIDs chosen to pass ParseUUIDPipe; route matches before tenant scope
# check runs (SessionCookieAuth rejects first).
TENANT=00000000-0000-0000-0000-000000000000
DOMAIN_ID=11111111-1111-1111-1111-111111111111
MIGRATION_ID=22222222-2222-2222-2222-222222222222
assert "domains list"              GET    /tenants/$TENANT/domains                    401
assert "domains add"               POST   /tenants/$TENANT/domains                    401
assert "domains verify"            POST   /tenants/$TENANT/domains/$DOMAIN_ID/verify  401
assert "domains delete"            DELETE /tenants/$TENANT/domains/$DOMAIN_ID         401

# Phase 4: public migration endpoints — bogus token resolves to 410 (gone),
# which is the enumeration-resistant "unavailable" response.
assert "migration lookup 410"      GET    /auth/public/migration/bogus-token          410
assert "migration accept 410"      POST   /auth/public/migration/bogus-token/accept   410
assert "migration decline 410"     POST   /auth/public/migration/bogus-token/decline  410

# Phase 4: admin migration endpoints — no cookie → 401.
assert "migrations list"           GET    /tenants/$TENANT/migrations                                  401
assert "migrations notify-force"   POST   /tenants/$TENANT/migrations/$MIGRATION_ID/notify-force       401
assert "migrations force"          POST   /tenants/$TENANT/migrations/$MIGRATION_ID/force              401

# Phase 5: multi-tenant session switcher. Cookie-authed; no cookie → 401.
assert "session memberships"       GET    /auth/session/memberships       401
assert "session active-tenant"     PATCH  /auth/session/active-tenant     401
assert "session rotate"            POST   /auth/session/rotate            401

echo ""
if [ "$FAIL" -eq 0 ]; then
    echo "ALL PASS"
    exit 0
fi
echo "$FAIL route(s) failed"
exit 1
