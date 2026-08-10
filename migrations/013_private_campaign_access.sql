-- 013_private_campaign_access.sql -- owner-managed private campaign access.
-- Apply after 012_trust_system.sql. Do not run from application code.

CREATE TABLE IF NOT EXISTS campaign_participants (
  campaign_id text NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  creator_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'authorized' CHECK (status IN ('authorized', 'revoked')),
  authorized_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, creator_id)
);
CREATE INDEX IF NOT EXISTS campaign_participants_creator_idx
  ON campaign_participants (creator_id, campaign_id);
