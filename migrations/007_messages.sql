-- 007_messages.sql
-- Direct 1-on-1 messaging between users (creator ↔ creator, etc.).
-- Run each statement one at a time in the Neon SQL Editor.

CREATE TABLE IF NOT EXISTS messages (
  id text PRIMARY KEY,
  sender_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body text NOT NULL,
  read text NOT NULL DEFAULT 'no',
  created_at timestamp NOT NULL DEFAULT now()
);

-- Speeds up loading a conversation and counting unread messages.
CREATE INDEX IF NOT EXISTS messages_participants_idx ON messages (sender_id, recipient_id);
CREATE INDEX IF NOT EXISTS messages_recipient_idx ON messages (recipient_id, read);
