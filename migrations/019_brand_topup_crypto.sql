-- 019_brand_topup_crypto.sql -- automatic crypto top-ups (NOWPayments).
-- Apply after 018_brand_wallet.sql. Do not run from application code.
--
-- Adds a second funding path into the EXISTING brand_topups lifecycle: instead
-- of an admin manually marking a top-up 'completed', a signed NOWPayments IPN
-- drives the same pending → processing → completed transition once the payment
-- is confirmed on-chain. No new money tables, no balance column — balances stay
-- derived from completed brand_topups (§5). Purely additive and non-destructive:
-- two nullable columns + one partial-unique index. Nothing existing is dropped,
-- altered destructively, or back-filled; manual top-ups keep provider = NULL and
-- behave exactly as before (§17).
BEGIN;

-- provider: which rail funded this top-up. NULL = the original manual/admin flow;
-- 'nowpayments' = created via the hosted crypto checkout.
ALTER TABLE brand_topups ADD COLUMN IF NOT EXISTS provider text;

-- provider_charge_id: the NOWPayments invoice id. Enforces idempotency at the DB
-- level and serves as an audit correlation handle (the IPN itself correlates by
-- the order_id we set to the top-up id).
ALTER TABLE brand_topups ADD COLUMN IF NOT EXISTS provider_charge_id text;

-- One top-up per provider invoice, ever. A re-delivered IPN (NOWPayments retries)
-- can therefore never map an invoice onto a second row. Partial: manual top-ups
-- (NULL charge id) are unconstrained, so many rows may keep NULL (§9 idempotency).
CREATE UNIQUE INDEX IF NOT EXISTS brand_topups_provider_charge_idx
  ON brand_topups (provider_charge_id)
  WHERE provider_charge_id IS NOT NULL;

COMMIT;
