-- 025_saved_campaigns.sql — a creator's private campaign bookmarks.
--
-- Apply after 024_submission_rejection_reason.sql. Run in the Neon SQL Editor
-- with Read-only OFF. Do not run from application code.
--
-- Additive and idempotent. NON-FINANCIAL: this table is read only to render a
-- creator's Saved list and mark cards; it is never touched by any payout,
-- ledger, or balance math. Does not touch the financial migration guard (020).
BEGIN;

CREATE TABLE IF NOT EXISTS saved_campaigns (
  user_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campaign_id text NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  created_at  timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, campaign_id)
);

CREATE INDEX IF NOT EXISTS saved_campaigns_user_idx
  ON saved_campaigns (user_id, created_at);

COMMIT;
