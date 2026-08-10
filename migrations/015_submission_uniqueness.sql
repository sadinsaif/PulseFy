-- 015_submission_uniqueness.sql -- one campaign submission per creator.
-- Apply after 014_campaign_budget_spend.sql. Do not run from application code.
-- Refuse to create the invariant if historical duplicates need operator review;
-- this migration never deletes or rewrites submissions.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM submissions
    WHERE campaign_id IS NOT NULL
    GROUP BY user_id, campaign_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot add submissions_unique_creator_campaign_idx: duplicate campaign submissions exist. Reconcile them before retrying migration 015.';
  END IF;

  -- The submit route has always treated a legacy challenge as one submission
  -- per creator as well. Refuse historical duplicates instead of selecting or
  -- deleting a winner.
  IF EXISTS (
    SELECT 1
    FROM submissions
    WHERE campaign_id IS NULL
    GROUP BY user_id, challenge_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot add submissions_unique_creator_legacy_challenge_idx: duplicate legacy challenge submissions exist. Reconcile them before retrying migration 015.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS submissions_unique_creator_campaign_idx
  ON submissions (user_id, campaign_id)
  WHERE campaign_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS submissions_unique_creator_legacy_challenge_idx
  ON submissions (user_id, challenge_id)
  WHERE campaign_id IS NULL;
