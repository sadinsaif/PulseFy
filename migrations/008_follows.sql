-- 008_follows.sql
-- Creator follow relationships (many-to-many): follower_id follows following_id.
-- Run each statement one at a time in the Neon SQL Editor.

CREATE TABLE IF NOT EXISTS follows (
  id text PRIMARY KEY,
  follower_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamp NOT NULL DEFAULT now()
);

-- Count "following" (who a user follows) and check a specific relationship.
CREATE INDEX IF NOT EXISTS follows_follower_idx ON follows (follower_id);

-- Count "followers" (who follows a user).
CREATE INDEX IF NOT EXISTS follows_following_idx ON follows (following_id);

-- Fast lookup + uniqueness for a single follower→following pair (prevents
-- duplicate follows and speeds the "am I following?" check).
CREATE UNIQUE INDEX IF NOT EXISTS follows_relationship_idx ON follows (follower_id, following_id);
