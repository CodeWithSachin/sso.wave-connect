-- Migration 000019: Bootstrap first platform admin
--
-- Idempotent on two axes:
--   (a) no-op if ANY platform_admins row already exists (first-run-wins,
--       so re-running in a dev env after someone else bootstrapped is safe),
--   (b) no-op if the user referenced by PLATFORM_BOOTSTRAP_EMAIL setting
--       doesn't exist yet — this migration can be applied before the user
--       has signed up, and re-applied later once they have.
--
-- Usage:
--   SET app.platform_bootstrap_email = 'ops@example.com';
--   migrate up
--   -- or, set it via container env and exec psql with SET:
--   PGOPTIONS="-c app.platform_bootstrap_email=ops@example.com" migrate up
--
-- If the setting is empty/missing, the migration is a pure no-op — useful in
-- CI and for environments that provision platform admins out-of-band.

DO $$
DECLARE
    bootstrap_email TEXT;
    target_user_id  UUID;
BEGIN
    -- missing_ok = true so the migration doesn't fail when the GUC isn't set
    bootstrap_email := NULLIF(current_setting('app.platform_bootstrap_email', TRUE), '');

    IF bootstrap_email IS NULL THEN
        RAISE NOTICE '000019: app.platform_bootstrap_email not set — skipping platform admin bootstrap.';
        RETURN;
    END IF;

    IF EXISTS (SELECT 1 FROM platform_admins WHERE revoked_at IS NULL LIMIT 1) THEN
        RAISE NOTICE '000019: platform_admins already populated — skipping bootstrap.';
        RETURN;
    END IF;

    SELECT id INTO target_user_id
    FROM users
    WHERE email = bootstrap_email AND deleted_at IS NULL
    LIMIT 1;

    IF target_user_id IS NULL THEN
        RAISE NOTICE '000019: user % not found yet — re-run this migration after they sign up.', bootstrap_email;
        RETURN;
    END IF;

    INSERT INTO platform_admins (user_id, role, granted_by, granted_at, notes)
    VALUES (target_user_id, 'superadmin', target_user_id, NOW(),
            'Bootstrapped via migration 000019 from app.platform_bootstrap_email');

    RAISE NOTICE '000019: granted superadmin to user % (%).', bootstrap_email, target_user_id;
END $$;
