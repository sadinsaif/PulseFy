-- 010_reports.sql — private user reports and admin audit timeline.
CREATE TABLE IF NOT EXISTS reports (
  id text PRIMARY KEY, reporter_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reporter_type text NOT NULL, reported_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reported_user_type text NOT NULL, reason text NOT NULL, description text NOT NULL, evidence text,
  status text NOT NULL DEFAULT 'open', priority text NOT NULL DEFAULT 'normal',
  assigned_admin_id text REFERENCES users(id) ON DELETE SET NULL, resolution text, resolution_note text,
  resolved_by text REFERENCES users(id) ON DELETE SET NULL, resolved_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reports_queue_idx ON reports (status, priority, created_at DESC);
CREATE INDEX IF NOT EXISTS reports_reported_user_idx ON reports (reported_user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS reports_active_duplicate_idx ON reports (reporter_id, reported_user_id, reason)
  WHERE status IN ('open', 'under_review', 'awaiting_response');
CREATE TABLE IF NOT EXISTS report_events (
  id text PRIMARY KEY, report_id text NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  actor_id text REFERENCES users(id) ON DELETE SET NULL, action text NOT NULL, note text,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS report_events_report_idx ON report_events (report_id, created_at);
