-- 022_privy_columns_only.sql -- Unblock login/signup: add ONLY 021's two columns.
-- Apply after 020_campaign_soft_delete.sql. Safe to run before OR after 021.
-- Do not run from application code (run in the Neon SQL Editor, Read-only OFF).
--
-- WHY THIS EXISTS
-- db/schema.js declares users.privy_id and users.wallet_address, so Drizzle's
-- `db.select().from(users)` emits `SELECT ..., privy_id, wallet_address FROM
-- users`. Until those columns exist, EVERY such select 500s — which breaks
-- /api/register (signup) and the credentials authorize() (login), not just
-- withdrawals. Migration 021 adds these columns, but 021 is a single atomic
-- transaction that also builds a case-insensitive-unique username index; that
-- index RAISEs (and rolls the whole migration back) while duplicate usernames
-- exist. So the columns never land, and the app stays broken until the operator
-- reconciles duplicates.
--
-- This migration splits out just the additive, always-safe part of 021 — the two
-- nullable identity columns — so login/signup work immediately. It does NOT add
-- 021's three unique indexes; those are integrity hardening (privy_id uniqueness
-- for the dormant Privy bridge, plus lower(username)/lower(email) TOCTOU guards)
-- and can be applied later by running 021 in full AFTER reconciling duplicates.
-- All statements are idempotent (IF NOT EXISTS), so running 021 afterward is a
-- no-op on the columns and simply adds the indexes.
--
-- Additive and NON-FINANCIAL: touches no money tables, so the financial-migration
-- build guard stays at "020".
BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS privy_id text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_address text;

COMMIT;
