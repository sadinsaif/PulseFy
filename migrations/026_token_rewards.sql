-- 026_token_rewards.sql -- $PULSE token: verified wallets, balance snapshots,
-- append-only reward ledger, and claims. Apply after 025 in the Neon/Vercel SQL
-- editor. Do NOT run from application code.
--
-- The money model mirrors the brand wallet (018): a reward balance is always
-- DERIVED (Σaccrue − Σreversal − Σnon-failed-claims), never stored as a mutable
-- column, so there is no floating-point or double-write risk. The reward ledger
-- is append-only and immutable (a trigger blocks UPDATE/DELETE) — corrections are
-- compensating 'reversal'/'adjust' rows, never edits. Amounts are BASE UNITS
-- (9 decimals) in BIGINT: a 1e9-supply token is 1e18 base units, which fits
-- BIGINT (< 9.2e18) but exceeds JS Number's 2^53, so the app reads them as BigInt.
-- Additive and non-destructive: nothing existing is dropped or altered.
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. token_wallets — a user's VERIFIED Solana wallet. A row is written only
--    after a signed nonce proves the user controls the key (app/api/token/wallet).
--    Two unique indexes enforce the anti-farming invariant: one account per
--    wallet (unique wallet) and one wallet per user for the MVP (unique user_id),
--    so the same on-chain balance can't be linked to many accounts to multiply
--    hold-to-earn rewards.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS token_wallets (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet text NOT NULL,
  verified_at timestamp,
  created_at timestamp NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'token_wallets'::regclass AND attname = 'user_id' AND NOT attnotnull) THEN
    ALTER TABLE token_wallets ALTER COLUMN user_id SET NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'token_wallets'::regclass AND attname = 'wallet' AND NOT attnotnull) THEN
    ALTER TABLE token_wallets ALTER COLUMN wallet SET NOT NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS token_wallets_wallet_idx ON token_wallets (wallet);
CREATE UNIQUE INDEX IF NOT EXISTS token_wallets_user_idx ON token_wallets (user_id);

-- ---------------------------------------------------------------------------
-- 2. token_holding_snapshots — on-chain balance at each accrual run, per user.
--    balance is BASE UNITS in BIGINT (exact). These are the audit trail behind
--    every accrual: a reward is computed from the MIN of consecutive snapshots.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS token_holding_snapshots (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet text NOT NULL,
  balance bigint NOT NULL,
  taken_at timestamp NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'token_holding_snapshots'::regclass AND attname = 'user_id' AND NOT attnotnull) THEN
    ALTER TABLE token_holding_snapshots ALTER COLUMN user_id SET NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'token_holding_snapshots'::regclass AND attname = 'balance' AND NOT attnotnull) THEN
    ALTER TABLE token_holding_snapshots ALTER COLUMN balance SET NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS token_holding_snapshots_user_taken_idx
  ON token_holding_snapshots (user_id, taken_at DESC);

-- ---------------------------------------------------------------------------
-- 3. token_reward_ledger — append-only, immutable hold-to-earn movements.
--    System-written only (never user-edited):
--      accrue   — reward for a snapshot period (idempotent per period).
--      reversal — claw back a prior accrual (fraud / correction).
--      adjust   — manual admin grant / correction.
--    Base units, always positive (direction comes from `action`).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS token_reward_ledger (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('accrue', 'reversal', 'adjust')),
  amount bigint NOT NULL CHECK (amount > 0),
  reference text,
  note text,
  created_at timestamp NOT NULL DEFAULT now()
);

-- Reconcile invariants if db:push created the table before this migration.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'token_reward_ledger_action_check' AND conrelid = 'token_reward_ledger'::regclass) THEN
    ALTER TABLE token_reward_ledger ADD CONSTRAINT token_reward_ledger_action_check CHECK (action IN ('accrue', 'reversal', 'adjust'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'token_reward_ledger_amount_check' AND conrelid = 'token_reward_ledger'::regclass) THEN
    ALTER TABLE token_reward_ledger ADD CONSTRAINT token_reward_ledger_amount_check CHECK (amount > 0);
  END IF;
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'token_reward_ledger'::regclass AND attname = 'user_id' AND NOT attnotnull) THEN
    ALTER TABLE token_reward_ledger ALTER COLUMN user_id SET NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'token_reward_ledger'::regclass AND attname = 'action' AND NOT attnotnull) THEN
    ALTER TABLE token_reward_ledger ALTER COLUMN action SET NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'token_reward_ledger'::regclass AND attname = 'amount' AND NOT attnotnull) THEN
    ALTER TABLE token_reward_ledger ALTER COLUMN amount SET NOT NULL;
  END IF;
END $$;

-- Idempotency, DB-enforced: at most ONE accrual per (user, period) ever, so a
-- double-run of the accrual cron can never pay a period twice. `reference` is the
-- period key (e.g. 'accrue:2026-08-22'); NULL references are unconstrained.
CREATE UNIQUE INDEX IF NOT EXISTS token_reward_ledger_unique_accrual_idx
  ON token_reward_ledger (user_id, reference)
  WHERE action = 'accrue';
CREATE INDEX IF NOT EXISTS token_reward_ledger_user_created_idx
  ON token_reward_ledger (user_id, created_at DESC);

-- Append-only: corrections are compensating entries; rows can never be edited or
-- deleted after posting. Mirrors brand_wallet_ledger's immutability guarantee.
CREATE OR REPLACE FUNCTION prevent_token_reward_ledger_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'token_reward_ledger is append-only; record a compensating entry instead';
END;
$$ LANGUAGE plpgsql;
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'token_reward_ledger_immutable_trigger'
      AND tgrelid = 'token_reward_ledger'::regclass
      AND tgfoid <> 'prevent_token_reward_ledger_mutation()'::regprocedure
  ) THEN
    RAISE EXCEPTION 'Cannot reconcile token_reward_ledger immutable trigger: an incompatible trigger already exists.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'token_reward_ledger_immutable_trigger'
      AND tgrelid = 'token_reward_ledger'::regclass
  ) THEN
    CREATE TRIGGER token_reward_ledger_immutable_trigger
      BEFORE UPDATE OR DELETE ON token_reward_ledger
      FOR EACH ROW EXECUTE FUNCTION prevent_token_reward_ledger_mutation();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. token_claims — a holder requesting an on-chain payout of accrued rewards.
--    Mutable lifecycle, the honest "paid" mirror of withdrawals: created
--    'pending', settled by an admin to 'paid' (with the treasury tx signature)
--    or 'failed'. No immutability trigger — status must transition. Only
--    non-failed claims reduce the derived available balance (a failed claim
--    returns the rewards). Base units, BIGINT.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS token_claims (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount bigint NOT NULL CHECK (amount > 0),
  destination text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'failed')),
  tx_signature text,
  note text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'token_claims_amount_check' AND conrelid = 'token_claims'::regclass) THEN
    ALTER TABLE token_claims ADD CONSTRAINT token_claims_amount_check CHECK (amount > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'token_claims_status_check' AND conrelid = 'token_claims'::regclass) THEN
    ALTER TABLE token_claims ADD CONSTRAINT token_claims_status_check CHECK (status IN ('pending', 'paid', 'failed'));
  END IF;
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'token_claims'::regclass AND attname = 'user_id' AND NOT attnotnull) THEN
    ALTER TABLE token_claims ALTER COLUMN user_id SET NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'token_claims'::regclass AND attname = 'amount' AND NOT attnotnull) THEN
    ALTER TABLE token_claims ALTER COLUMN amount SET NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'token_claims'::regclass AND attname = 'destination' AND NOT attnotnull) THEN
    ALTER TABLE token_claims ALTER COLUMN destination SET NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'token_claims'::regclass AND attname = 'status' AND NOT attnotnull) THEN
    ALTER TABLE token_claims ALTER COLUMN status SET NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS token_claims_user_created_idx
  ON token_claims (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS token_claims_status_created_idx
  ON token_claims (status, created_at DESC);

COMMIT;
