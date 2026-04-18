# Platform Bootstrap — First Superadmin

How to create the first `platform_admins` row on a fresh deployment. Required
before `POST /api/v1/platform/admins`, `POST /api/v1/tenants`, and the rest of
the platform-admin surface can be used.

## The chicken-and-egg

- `POST /api/v1/platform/admins` requires an existing platform admin to call it.
- `POST /api/v1/tenants` also requires an existing platform admin.
- Creating a user today goes through identity-service's `/auth/register`,
  which currently requires an `X-Tenant-ID` — no tenant means no user.

Migration `000019_bootstrap_platform_admin.up.sql` solves this by upgrading
a pre-existing user row to `superadmin` when you give it an email via a
session GUC. Two pieces need to be true: the row in `users` must exist, and
the GUC must be set before the DO block runs.

## Sequence for a fresh deploy

```
# 1. Apply all migrations (reaches version 20, platform_admins empty)
./database/scripts/migrate.sh up

# 2. Create the first user row by any means available. For a fresh install
#    before Phase 1 (public /auth/public/signup) ships, this is a direct SQL
#    insert. Password will be set later via /auth/forgot-password flow.
psql "$DATABASE_URL" <<SQL
  INSERT INTO users (email, display_name, status, email_verified)
  VALUES ('ops@your-company.com', 'Platform Ops', 'active', true);
SQL

# 3. Re-run the bootstrap migration with the email set via session GUC.
#    `migrate` doesn't re-run applied migrations, so do this with psql
#    against the same DB, copy-pasting the DO block from 000019:
PGOPTIONS="-c app.platform_bootstrap_email=ops@your-company.com" \
  psql "$DATABASE_URL" -f database/migrations/000019_bootstrap_platform_admin.up.sql

# 4. Confirm
psql "$DATABASE_URL" -c "SELECT user_id, role, granted_at FROM platform_admins;"
```

Once Phase 1 ships `/auth/public/signup`, step 2 becomes:

```bash
curl -X POST http://localhost:3000/auth/public/signup \
  -H 'Content-Type: application/json' \
  -d '{"email":"ops@your-company.com","password":"…","display_name":"Platform Ops"}'
# then run steps 3 and 4
```

## Idempotency contract

The DO block in 000019 is a no-op when:
- `app.platform_bootstrap_email` is unset/empty.
- At least one row exists in `platform_admins` with `revoked_at IS NULL`.
- The user with that email doesn't exist (yet) or is soft-deleted.

All three paths emit `RAISE NOTICE`, so `psql -v VERBOSITY=verbose` shows
exactly which branch fired. Running 000019 twice in sequence is safe.

## Rotating the first superadmin

Once `platform_admins` has at least one active row, 000019's `EXISTS` check
makes re-running it a no-op — so it won't squat on your env. Normal grants
go through `POST /api/v1/platform/admins` (superadmin only) or direct SQL:

```sql
INSERT INTO platform_admins (user_id, role, granted_by, notes)
VALUES (
  (SELECT id FROM users WHERE email = 'new-ops@your-company.com'),
  'support',
  (SELECT id FROM users WHERE email = 'ops@your-company.com'),
  'Granted manually on YYYY-MM-DD'
);
```

## Locking yourself out

Revoking your own grant is blocked at the service layer (`platform-admins.service.ts`
— see `revoke()` self-check). If you manage to do it via raw SQL and no other
superadmin exists, recover by:

```sql
UPDATE platform_admins
SET revoked_at = NULL
WHERE user_id = (SELECT id FROM users WHERE email = 'ops@your-company.com');
```

## Related migrations

- `000018_platform_admins.up.sql` — creates the table, enum, partial index.
- `000019_bootstrap_platform_admin.up.sql` — the idempotent DO block.
- `000020_tenants_billing_reserve.up.sql` — reserves billing columns (unused
  until billing integration lands; no bootstrap impact).
