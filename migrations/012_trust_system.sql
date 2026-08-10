-- 012_trust_system.sql -- PulseFy creator/brand trust system.
-- Apply manually after 011_moderation.sql. Do not run from application code.

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verified_at timestamp;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verified_by text REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS reviews (
  id text PRIMARY KEY,
  campaign_id text NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  reviewer_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewee_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewer_type text NOT NULL CHECK (reviewer_type IN ('creator', 'brand')),
  reviewee_type text NOT NULL CHECK (reviewee_type IN ('creator', 'brand')),
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text NOT NULL,
  status text NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'hidden')),
  moderated_by text REFERENCES users(id) ON DELETE SET NULL,
  moderation_note text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CHECK (reviewer_id <> reviewee_id),
  CHECK (reviewer_type <> reviewee_type)
);
-- db:push may have created these tables before this migration. Reconcile every
-- invariant without dropping/recreating data when that has happened.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reviews_reviewer_type_check' AND conrelid = 'reviews'::regclass) THEN
    ALTER TABLE reviews ADD CONSTRAINT reviews_reviewer_type_check CHECK (reviewer_type IN ('creator', 'brand'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reviews_reviewee_type_check' AND conrelid = 'reviews'::regclass) THEN
    ALTER TABLE reviews ADD CONSTRAINT reviews_reviewee_type_check CHECK (reviewee_type IN ('creator', 'brand'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reviews_rating_check' AND conrelid = 'reviews'::regclass) THEN
    ALTER TABLE reviews ADD CONSTRAINT reviews_rating_check CHECK (rating BETWEEN 1 AND 5);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reviews_status_check' AND conrelid = 'reviews'::regclass) THEN
    ALTER TABLE reviews ADD CONSTRAINT reviews_status_check CHECK (status IN ('visible', 'hidden'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reviews_not_self_check' AND conrelid = 'reviews'::regclass) THEN
    ALTER TABLE reviews ADD CONSTRAINT reviews_not_self_check CHECK (reviewer_id <> reviewee_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reviews_opposite_roles_check' AND conrelid = 'reviews'::regclass) THEN
    ALTER TABLE reviews ADD CONSTRAINT reviews_opposite_roles_check CHECK (reviewer_type <> reviewee_type);
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS reviews_unique_campaign_relationship_idx
  ON reviews (campaign_id, reviewer_id, reviewee_id);
CREATE INDEX IF NOT EXISTS reviews_reviewee_visible_idx ON reviews (reviewee_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS reviews_reviewer_idx ON reviews (reviewer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS reviews_campaign_idx ON reviews (campaign_id, created_at DESC);

CREATE TABLE IF NOT EXISTS creator_portfolio (
  id text PRIMARY KEY,
  creator_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  category text,
  thumbnail_url text,
  work_url text NOT NULL,
  platform text,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS creator_portfolio_owner_idx ON creator_portfolio (creator_id, display_order, created_at DESC);

CREATE TABLE IF NOT EXISTS creator_social_links (
  id text PRIMARY KEY,
  creator_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('instagram', 'tiktok', 'youtube', 'x', 'facebook', 'linkedin', 'website')),
  url text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (creator_id, platform)
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'creator_social_links_platform_check' AND conrelid = 'creator_social_links'::regclass) THEN
    ALTER TABLE creator_social_links ADD CONSTRAINT creator_social_links_platform_check CHECK (platform IN ('instagram', 'tiktok', 'youtube', 'x', 'facebook', 'linkedin', 'website'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'creator_social_links_creator_platform_key' AND conrelid = 'creator_social_links'::regclass) THEN
    ALTER TABLE creator_social_links ADD CONSTRAINT creator_social_links_creator_platform_key UNIQUE (creator_id, platform);
  END IF;
END $$;
