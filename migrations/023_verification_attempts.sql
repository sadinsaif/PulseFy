-- 023_verification_attempts.sql -- Email verification CODE (6-digit OTP) support.
-- Apply after 022_privy_columns_only.sql, and BEFORE deploying the signup-code
-- build / setting REQUIRE_EMAIL_VERIFICATION=true. Run in the Neon SQL Editor
-- with Read-only OFF. Additive, non-financial, idempotent.
--
-- Adds a per-code wrong-guess counter to verification_tokens so a short 6-digit
-- signup code can be checked safely: after 5 wrong guesses the code is burned
-- and the user must request a new one, which bounds brute force to a handful of
-- tries per emailed code. The password-reset / email-verification LINK flow is
-- untouched (findToken looks a long token up by value and never reads this
-- column), so this is purely additive for that path.
BEGIN;

ALTER TABLE verification_tokens ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;

COMMIT;
