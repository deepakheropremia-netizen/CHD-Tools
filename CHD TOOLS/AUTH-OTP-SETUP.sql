-- CHD Tools — Phone OTP login support
-- Run once in Supabase → SQL Editor after AUTH-SETUP.sql

-- Staff mobile numbers (Indian 10-digit stored as 10 digits, no +91)
ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS phone text;

CREATE UNIQUE INDEX IF NOT EXISTS app_users_phone_unique
  ON app_users (phone)
  WHERE phone IS NOT NULL AND phone <> '';

COMMENT ON COLUMN app_users.phone IS '10-digit Indian mobile for OTP login';

-- One-time passwords
CREATE TABLE IF NOT EXISTS login_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  consumed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS login_otps_phone_created
  ON login_otps (phone, created_at DESC);

-- Optional cleanup of old rows (manual or cron)
-- DELETE FROM login_otps WHERE created_at < now() - interval '1 day';
