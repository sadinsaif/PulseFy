-- Migration 004: submission metrics (views + engagement)
-- Rate is computed in the app as engagement / views * 100.
-- bigint (not integer): viral videos exceed 2.1B views and would overflow int4.
-- Run each statement ONE AT A TIME in the Neon SQL Editor (Read-only OFF).
-- Safe to run even if you already added these as integer — the last two
-- statements widen an existing integer column to bigint.

ALTER TABLE submissions ADD COLUMN IF NOT EXISTS views bigint NOT NULL DEFAULT 0;

ALTER TABLE submissions ADD COLUMN IF NOT EXISTS engagement bigint NOT NULL DEFAULT 0;

ALTER TABLE submissions ALTER COLUMN views TYPE bigint;

ALTER TABLE submissions ALTER COLUMN engagement TYPE bigint;
