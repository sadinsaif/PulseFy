-- Add GIMI-style rich campaign fields to the campaigns table.
-- Run this in Neon SQL Editor (one statement at a time).

ALTER TABLE campaigns ADD COLUMN submit_type TEXT DEFAULT 'distribution';
ALTER TABLE campaigns ADD COLUMN requirements TEXT;
ALTER TABLE campaigns ADD COLUMN content_type TEXT DEFAULT 'ugc';
ALTER TABLE campaigns ADD COLUMN assets_url TEXT;
ALTER TABLE campaigns ADD COLUMN visibility TEXT DEFAULT 'public';
ALTER TABLE campaigns ADD COLUMN show_contributions TEXT DEFAULT 'yes';
ALTER TABLE campaigns ADD COLUMN thumbnail_url TEXT;
ALTER TABLE campaigns ADD COLUMN banner_url TEXT;
