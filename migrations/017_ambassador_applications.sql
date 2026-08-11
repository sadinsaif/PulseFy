-- 017_ambassador_applications.sql — Ambassador Program applications.
-- Apply after 016_campaign_funding_ledger.sql. Run once against Neon; do not
-- run from application code.
--
-- Purely additive: it creates one new table plus its indexes and never drops
-- or alters an existing table, so it is safe to run and safe to re-run
-- (every statement is IF NOT EXISTS).
BEGIN;

CREATE TABLE IF NOT EXISTS ambassador_applications (
  id text PRIMARY KEY,
  -- Nullable: the /ambassador page is public, so anonymous applications are
  -- allowed. Set to the applicant's account when they apply signed in.
  user_id text REFERENCES users(id) ON DELETE SET NULL,
  name text NOT NULL,
  email text NOT NULL,               -- stored lowercased by the API
  country text,                      -- country / region
  platform text NOT NULL,            -- tiktok | instagram | youtube | x | other
  handle text NOT NULL,              -- @handle or channel
  social_link text,                  -- full profile / channel URL (optional)
  audience_size text NOT NULL,       -- tier label, e.g. "1k-10k"
  content_category text,             -- technology | gaming | lifestyle | ...
  reason text NOT NULL,              -- why they'd be a great ambassador
  referral_source text,              -- how they heard about PulseFy (optional)
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('draft', 'submitted', 'under_review', 'approved', 'rejected')),
  reviewer_id text REFERENCES users(id) ON DELETE SET NULL,
  reviewer_note text,
  submitted_at timestamp NOT NULL DEFAULT now(),
  reviewed_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

-- db:push may have created the table before this hand-authored migration.
-- Add the status CHECK if it is missing, validating existing rows rather than
-- rewriting them.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ambassador_applications_status_check'
      AND conrelid = 'ambassador_applications'::regclass
  ) THEN
    ALTER TABLE ambassador_applications
      ADD CONSTRAINT ambassador_applications_status_check
      CHECK (status IN ('draft', 'submitted', 'under_review', 'approved', 'rejected'));
  END IF;
END $$;

-- At most one *active* application per email (case-insensitive) and per
-- account. Terminal 'rejected' (and 'draft') are excluded, so a rejected
-- applicant can re-apply.
CREATE UNIQUE INDEX IF NOT EXISTS ambassador_applications_active_email_idx
  ON ambassador_applications (lower(email))
  WHERE status IN ('submitted', 'under_review', 'approved');
CREATE UNIQUE INDEX IF NOT EXISTS ambassador_applications_active_user_idx
  ON ambassador_applications (user_id)
  WHERE user_id IS NOT NULL AND status IN ('submitted', 'under_review', 'approved');

-- Supporting indexes for the applicant status lookup and the admin queue.
CREATE INDEX IF NOT EXISTS ambassador_applications_user_idx
  ON ambassador_applications (user_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS ambassador_applications_status_idx
  ON ambassador_applications (status, submitted_at DESC);

COMMIT;
