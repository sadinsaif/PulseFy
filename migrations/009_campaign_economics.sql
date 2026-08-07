-- 009_campaign_economics.sql
-- GIMI-style campaign economics: total Budget (pool), Spotlight bonus,
-- Performance multiplier, and an end date for the live countdown.
-- Run each statement one at a time in the Neon SQL Editor.

ALTER TABLE campaigns ADD COLUMN budget INTEGER NOT NULL DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN spotlight_reward INTEGER NOT NULL DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN performance_mult INTEGER NOT NULL DEFAULT 1;
ALTER TABLE campaigns ADD COLUMN ends_at TIMESTAMP;
