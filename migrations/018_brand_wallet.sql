-- 018_brand_wallet.sql -- brand wallet: top-ups + append-only brand-level reserve/release ledger.
-- Apply after 017_ambassador_applications.sql. Do not run from application code.
--
-- Adds the money layer behind campaign launch: a brand tops up its wallet
-- (brand_topups, admin-confirmed like withdrawals), a campaign launch holds its
-- budget out of Available (brand_wallet_ledger 'reserve'), and a campaign end
-- returns unused budget (brand_wallet_ledger 'release'). Balances are always
-- DERIVED from these tables + completed top-ups; no mutable balance column, so
-- no floating-point or double-write risk. Additive and non-destructive: nothing
-- existing is dropped, altered destructively, or back-filled.
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. campaigns.idempotency_key — launch double-submit guard (§9).
--    A wallet-funded launch sends a client-generated key; a repeated POST with
--    the same key returns the already-created campaign instead of creating a
--    second one (and reserving its budget twice). Nullable: legacy campaigns and
--    unfunded ($0) launches may omit it. The partial-unique index only constrains
--    non-null keys, so many rows may keep NULL. Scoped to (brand_id, key): keys
--    are client-supplied, so uniqueness must be per-brand — one brand's key can
--    never collide with, or expose, another brand's campaign (§19).
-- ---------------------------------------------------------------------------
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS campaigns_idempotency_key_idx
  ON campaigns (brand_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. brand_topups — a brand adding money to its wallet. Mutable lifecycle, the
--    honest "money confirmed" mirror of withdrawals: created 'pending', credited
--    to Available only when an admin marks it 'completed' with a payment
--    reference. No immutability trigger — status must transition. Whole-dollar
--    integers, USD (§18).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS brand_topups (
  id text PRIMARY KEY,
  brand_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount integer NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  reference text,
  note text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

-- Reconcile every invariant if db:push created the table before this migration.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'brand_topups_amount_check' AND conrelid = 'brand_topups'::regclass) THEN
    ALTER TABLE brand_topups ADD CONSTRAINT brand_topups_amount_check CHECK (amount > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'brand_topups_status_check' AND conrelid = 'brand_topups'::regclass) THEN
    ALTER TABLE brand_topups ADD CONSTRAINT brand_topups_status_check CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled'));
  END IF;
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'brand_topups'::regclass AND attname = 'brand_id' AND NOT attnotnull) THEN
    ALTER TABLE brand_topups ALTER COLUMN brand_id SET NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'brand_topups'::regclass AND attname = 'amount' AND NOT attnotnull) THEN
    ALTER TABLE brand_topups ALTER COLUMN amount SET NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'brand_topups'::regclass AND attname = 'status' AND NOT attnotnull) THEN
    ALTER TABLE brand_topups ALTER COLUMN status SET NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS brand_topups_brand_created_idx
  ON brand_topups (brand_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 3. brand_wallet_ledger — append-only, immutable brand-level budget movements.
--    System-written only (never user-edited):
--      reserve — a campaign launch holds its whole budget out of Available (§8).
--      release — a campaign end returns its unused budget to Available (§14).
--    Whole dollars, always positive (§18).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS brand_wallet_ledger (
  id text PRIMARY KEY,
  brand_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campaign_id text NOT NULL REFERENCES campaigns(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('reserve', 'release')),
  amount integer NOT NULL CHECK (amount > 0),
  note text,
  created_at timestamp NOT NULL DEFAULT now()
);

-- Reconcile invariants if db:push created the table before this migration.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'brand_wallet_ledger_action_check' AND conrelid = 'brand_wallet_ledger'::regclass) THEN
    ALTER TABLE brand_wallet_ledger ADD CONSTRAINT brand_wallet_ledger_action_check CHECK (action IN ('reserve', 'release'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'brand_wallet_ledger_amount_check' AND conrelid = 'brand_wallet_ledger'::regclass) THEN
    ALTER TABLE brand_wallet_ledger ADD CONSTRAINT brand_wallet_ledger_amount_check CHECK (amount > 0);
  END IF;
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'brand_wallet_ledger'::regclass AND attname = 'brand_id' AND NOT attnotnull) THEN
    ALTER TABLE brand_wallet_ledger ALTER COLUMN brand_id SET NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'brand_wallet_ledger'::regclass AND attname = 'campaign_id' AND NOT attnotnull) THEN
    ALTER TABLE brand_wallet_ledger ALTER COLUMN campaign_id SET NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'brand_wallet_ledger'::regclass AND attname = 'action' AND NOT attnotnull) THEN
    ALTER TABLE brand_wallet_ledger ALTER COLUMN action SET NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'brand_wallet_ledger'::regclass AND attname = 'amount' AND NOT attnotnull) THEN
    ALTER TABLE brand_wallet_ledger ALTER COLUMN amount SET NOT NULL;
  END IF;
END $$;

-- Idempotency, DB-enforced (§9): a campaign can reserve at most ONCE and release
-- at most ONCE, ever — regardless of double-clicks, refreshes, retries or tabs.
CREATE UNIQUE INDEX IF NOT EXISTS brand_wallet_ledger_unique_reserve_idx
  ON brand_wallet_ledger (campaign_id)
  WHERE action = 'reserve';
CREATE UNIQUE INDEX IF NOT EXISTS brand_wallet_ledger_unique_release_idx
  ON brand_wallet_ledger (campaign_id)
  WHERE action = 'release';
CREATE INDEX IF NOT EXISTS brand_wallet_ledger_brand_created_idx
  ON brand_wallet_ledger (brand_id, created_at DESC);

-- Corrections are represented by a compensating entry; ledger rows themselves
-- can never be edited or deleted after posting (§17 never delete financial
-- records). Mirrors the campaign_funding_ledger immutability guarantee.
CREATE OR REPLACE FUNCTION prevent_brand_wallet_ledger_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'brand_wallet_ledger is append-only; record a compensating entry instead';
END;
$$ LANGUAGE plpgsql;
DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'brand_wallet_ledger_immutable_trigger'
      AND tgrelid = 'brand_wallet_ledger'::regclass
      AND tgfoid <> 'prevent_brand_wallet_ledger_mutation()'::regprocedure
  ) THEN
    RAISE EXCEPTION 'Cannot reconcile brand_wallet_ledger immutable trigger: an incompatible trigger already exists.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'brand_wallet_ledger_immutable_trigger'
      AND tgrelid = 'brand_wallet_ledger'::regclass
  ) THEN
    CREATE TRIGGER brand_wallet_ledger_immutable_trigger
      BEFORE UPDATE OR DELETE ON brand_wallet_ledger
      FOR EACH ROW EXECUTE FUNCTION prevent_brand_wallet_ledger_mutation();
  END IF;
END $$;

COMMIT;
