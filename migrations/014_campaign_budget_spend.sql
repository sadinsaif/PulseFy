-- 014_campaign_budget_spend.sql -- durable campaign budget reservations.
-- Apply after 013_private_campaign_access.sql and after the base Drizzle schema.
-- Do not run from application code.
--
-- Older installations may have received these columns from db:push rather than
-- a numbered migration. Reconcile them before calculating historical spend.
-- The transaction means an incomplete historical backfill cannot be committed.
BEGIN;

ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS campaign_id text REFERENCES campaigns(id) ON DELETE SET NULL;
ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS reward integer NOT NULL DEFAULT 0;
ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS spotlight_bonus integer NOT NULL DEFAULT 0;
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS budget_spent integer NOT NULL DEFAULT 0;

-- ADD COLUMN IF NOT EXISTS does not add its REFERENCES clause when db:push
-- already created campaign_id. Reconcile that case without replacing data.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN unnest(c.conkey) AS key_col(attnum) ON true
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = key_col.attnum
    WHERE c.contype = 'f'
      AND c.conrelid = 'submissions'::regclass
      AND a.attname = 'campaign_id'
      AND c.confrelid = 'campaigns'::regclass
      AND c.confdeltype = 'n'
  ) THEN
    -- Do not stack an incompatible FK on a pre-existing column. An operator
    -- must reconcile that schema deliberately; orphaned rows also make the
    -- following ALTER fail safely instead of being rewritten.
    IF EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN unnest(c.conkey) AS key_col(attnum) ON true
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = key_col.attnum
      WHERE c.contype = 'f'
        AND c.conrelid = 'submissions'::regclass
        AND a.attname = 'campaign_id'
    ) THEN
      RAISE EXCEPTION
        'Cannot reconcile submissions.campaign_id FK: an incompatible foreign key already exists. Reconcile it before retrying migration 014.';
    END IF;

    ALTER TABLE submissions
      ADD CONSTRAINT submissions_campaign_id_campaigns_id_fk
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'campaigns_budget_spent_nonnegative_check'
      AND conrelid = 'campaigns'::regclass
  ) THEN
    ALTER TABLE campaigns
      ADD CONSTRAINT campaigns_budget_spent_nonnegative_check CHECK (budget_spent >= 0);
  END IF;

  -- Do not introduce a counter whose historical commitments already exceed its
  -- declared budget; an operator must reconcile that data explicitly.
  IF EXISTS (
    SELECT 1
    FROM campaigns c
    WHERE coalesce((
      SELECT sum(
        CASE WHEN s.status = 'approved' THEN s.reward ELSE 0 END +
        CASE WHEN s.spotlighted THEN s.spotlight_bonus ELSE 0 END
      )
      FROM submissions s
      WHERE s.campaign_id = c.id
    ), 0) > c.budget
  ) THEN
    RAISE EXCEPTION
      'Cannot initialize campaign budget_spent: historical approved rewards exceed a campaign budget. Reconcile the affected campaigns before retrying migration 014.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'campaigns_budget_spent_within_budget_check'
      AND conrelid = 'campaigns'::regclass
  ) THEN
    ALTER TABLE campaigns
      ADD CONSTRAINT campaigns_budget_spent_within_budget_check
      CHECK (budget_spent <= budget);
  END IF;
END $$;

-- Backfill commitments recorded before this durable counter existed.
UPDATE campaigns c
SET budget_spent = coalesce((
  SELECT sum(
    CASE WHEN s.status = 'approved' THEN s.reward ELSE 0 END +
    CASE WHEN s.spotlighted THEN s.spotlight_bonus ELSE 0 END
  )
  FROM submissions s
  WHERE s.campaign_id = c.id
), 0);

COMMIT;
