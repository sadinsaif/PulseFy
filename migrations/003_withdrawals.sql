-- Migration 003: withdrawals (creator cash-out)
-- Run each statement ONE AT A TIME in the Neon SQL Editor (Read-only OFF).

CREATE TABLE IF NOT EXISTS withdrawals (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount integer NOT NULL DEFAULT 0,
  fee integer NOT NULL DEFAULT 0,
  net integer NOT NULL DEFAULT 0,
  method text NOT NULL DEFAULT 'stablecoin',
  coin text,
  network text,
  destination text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamp NOT NULL DEFAULT now()
);
