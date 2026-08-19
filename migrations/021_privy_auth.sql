-- 021_privy_auth.sql -- Privy auth (account creation + login) alongside email/password.
-- Apply after 020_campaign_soft_delete.sql. Do not run from application code.
--
-- Additive and NON-FINANCIAL: adds two nullable identity columns to users and
-- three uniqueness guarantees. Nothing existing is dropped, altered
-- destructively, or back-filled. Because it touches no money tables, the
-- financial-migration build guard (scripts/verify-financial-migrations.js) stays
-- at "020" and PULSEFY_FINANCIAL_MIGRATIONS_APPLIED is unchanged.
--
--   privy_id       — the stable Privy DID. The identity key the auth bridge
--                    resolves by FIRST (never by email alone), so a Privy login
--                    always maps back to the same local row. Unique.
--   wallet_address — the auto-provisioned embedded USDC-on-Base wallet (a 0x EVM
--                    address). Read server-side from Privy and prefilled into the
--                    withdrawal form; the withdrawal 0x-regex + admin settlement
--                    remain the authority, so this is convenience only.
--
-- The two functional unique indexes (lower(username), lower(email)) also close a
-- pre-existing TOCTOU race in /api/register: the app enforces case-insensitive
-- uniqueness in code, but without a DB index two concurrent signups could still
-- both pass the check. The bridge's account-creation path relies on this index +
-- a unique-violation retry, so the guarantee must live in the DB.
--
-- Run in the Neon SQL Editor with Read-only OFF. Atomic: if a duplicate check
-- below RAISEs, the whole migration rolls back and nothing is left half-applied.
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Identity columns. Both nullable: every existing row (and every future
--    email/password signup) simply keeps them NULL.
-- ---------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS privy_id text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_address text;

-- ---------------------------------------------------------------------------
-- 2. privy_id is unique. Partial (WHERE NOT NULL) so the many rows that never
--    use Privy — all keeping NULL — are simply not constrained (a plain unique
--    index would also allow multiple NULLs in Postgres, but the partial index
--    states the intent and stays cheap).
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS users_privy_id_idx
  ON users (privy_id)
  WHERE privy_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Case-insensitive UNIQUE username. Usernames are stored with their original
--    case, so historical case-only duplicates ("Maya" vs "maya") are possible.
--    Refuse to create the invariant if any exist — never pick a winner, never
--    delete — so an operator can reconcile first (mirrors migration 015).
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM users
    WHERE username IS NOT NULL
    GROUP BY lower(username)
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot add users_lower_username_idx: case-insensitive duplicate usernames exist. Reconcile them before retrying migration 021.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS users_lower_username_idx
  ON users (lower(username))
  WHERE username IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. Case-insensitive UNIQUE email. email already carries a raw UNIQUE
--    constraint and every write lowercases, so app-written rows are already
--    effectively unique here; this hardens against any legacy mixed-case row.
--    Same refuse-don't-destroy guard as above.
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM users
    WHERE email IS NOT NULL
    GROUP BY lower(email)
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot add users_lower_email_idx: case-insensitive duplicate emails exist. Reconcile them before retrying migration 021.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS users_lower_email_idx
  ON users (lower(email));

COMMIT;
