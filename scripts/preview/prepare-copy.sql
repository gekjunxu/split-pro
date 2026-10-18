BEGIN;

-- Preserve the provider identity mapping needed for Google sign-in while removing
-- all credentials and tokens copied from the production database.
UPDATE "Account"
SET
  refresh_token = NULL,
  access_token = NULL,
  expires_at = NULL,
  token_type = NULL,
  scope = NULL,
  id_token = NULL,
  session_state = NULL;

DELETE FROM "Session";
DELETE FROM "VerificationToken";
DELETE FROM "PushNotification";

-- Banking IDs may include access tokens; remove cached external bank payloads too.
DELETE FROM "CachedBankData";
UPDATE "User"
SET "bankingId" = NULL,
    "obapiProviderId" = NULL;

-- Retain recurrence records for comparison, but prevent copied scheduled jobs
-- from running against the preview database.
DO $$
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    EXECUTE 'UPDATE cron.job SET active = false';
  END IF;
END
$$;

COMMIT;
