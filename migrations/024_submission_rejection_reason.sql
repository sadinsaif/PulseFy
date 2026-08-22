-- 024_submission_rejection_reason.sql — the optional note a brand/admin leaves
-- when rejecting a post, shown back to the creator.
--
-- Apply after 023_verification_attempts.sql. Run in the Neon SQL Editor with
-- Read-only OFF. Do not run from application code.
--
-- Additive and idempotent. NON-FINANCIAL: this column is never read by the
-- payout math in /api/review (committed()), so it cannot affect any reward,
-- ledger entry, or balance. Does not touch the financial migration guard (020).
BEGIN;

ALTER TABLE submissions ADD COLUMN IF NOT EXISTS rejection_reason text;

COMMIT;
