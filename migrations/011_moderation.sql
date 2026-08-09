-- 011_moderation.sql — account moderation state and append-only admin audit log.
-- Apply after 010_reports.sql. Do not run from application code.
ALTER TABLE users ADD COLUMN IF NOT EXISTS moderation_status text NOT NULL DEFAULT 'active'
  CHECK (moderation_status IN ('active', 'warned', 'suspended', 'banned'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_until timestamp;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspension_reason text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_at timestamp;
ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_by text REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS moderation_events (
  id text PRIMARY KEY,
  target_user_id text REFERENCES users(id) ON DELETE SET NULL,
  admin_id text REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  reason text,
  note text,
  previous_status text,
  new_status text,
  expires_at timestamp,
  related_report_id text REFERENCES reports(id) ON DELETE SET NULL,
  related_campaign_id text REFERENCES campaigns(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS moderation_events_target_idx ON moderation_events (target_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS moderation_events_audit_idx ON moderation_events (created_at DESC);
CREATE INDEX IF NOT EXISTS moderation_events_report_idx ON moderation_events (related_report_id, created_at DESC);
