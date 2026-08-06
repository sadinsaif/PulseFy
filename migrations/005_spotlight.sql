-- Migration 005: Spotlight
-- Admin highlights an outstanding post; the creator earns a bonus (whole
-- dollars) on top of the campaign reward, and the post shows in the public
-- "Spotlighted" showcase. The bonus counts toward earnings + withdrawable balance.
-- Run each statement ONE AT A TIME in the Neon SQL Editor (Read-only OFF).

ALTER TABLE submissions ADD COLUMN IF NOT EXISTS spotlighted boolean NOT NULL DEFAULT false;

ALTER TABLE submissions ADD COLUMN IF NOT EXISTS spotlight_bonus integer NOT NULL DEFAULT 0;
