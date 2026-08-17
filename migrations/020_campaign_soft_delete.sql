-- 020_campaign_soft_delete.sql -- admin soft-delete (archive) for campaigns.
-- Apply after 019_brand_topup_crypto.sql. Do not run from application code.
--
-- Adds ONE nullable timestamp column, deleted_at, to campaigns. It is the admin
-- "delete any campaign" marker: a non-null deleted_at means the campaign is
-- archived and hidden from every listing, browse, and detail surface, while its
-- row -- and all financial / audit history that references it -- is preserved.
--
-- This is deliberately a SOFT delete. The two financial ledgers reference
-- campaigns with ON DELETE RESTRICT and are immutable (BEFORE UPDATE OR DELETE
-- triggers in 016/018), so a funded campaign can never be physically removed
-- without corrupting the derived wallet balances. The delete action reuses the
-- existing campaign-END money path: it sets status='ended' and posts the
-- one-time brand_wallet_ledger 'release' row for the unused budget
-- (budget - budget_spent), so reserved funds return to the brand's Available
-- balance exactly as they do on a normal end. Paid-out creator earnings are never
-- clawed back. Purely additive and non-destructive: nothing is dropped, altered
-- destructively, or back-filled -- existing campaigns keep deleted_at = NULL and
-- behave exactly as before.
BEGIN;

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS deleted_at timestamp;

-- Every campaign listing/browse query filters `deleted_at IS NULL`. A partial
-- index keeps that common "not deleted, newest first" scan cheap without
-- indexing the rare archived rows.
CREATE INDEX IF NOT EXISTS campaigns_not_deleted_idx
  ON campaigns (created_at DESC)
  WHERE deleted_at IS NULL;

COMMIT;
