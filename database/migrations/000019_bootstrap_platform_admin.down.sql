-- Migration 000019 DOWN: Revoke any platform_admins row that was inserted by
-- the bootstrap migration. Identified by the exact notes string written in
-- the UP migration. Preserves any manually-inserted platform admins.

UPDATE platform_admins
SET revoked_at = NOW()
WHERE notes = 'Bootstrapped via migration 000019 from app.platform_bootstrap_email'
  AND revoked_at IS NULL;
