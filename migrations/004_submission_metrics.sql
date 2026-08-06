-- Migration 004: submission metrics (views + engagement)
-- Rate is computed in the app as engagement / views * 100.
-- Run each statement ONE AT A TIME in the Neon SQL Editor (Read-only OFF).

ALTER TABLE submissions ADD COLUMN IF NOT EXISTS views integer NOT NULL DEFAULT 0;

ALTER TABLE submissions ADD COLUMN IF NOT EXISTS engagement integer NOT NULL DEFAULT 0;
