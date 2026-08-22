import { and, desc, eq, sql } from "drizzle-orm";
import {
  tokenRewardLedger,
  tokenClaims,
  tokenHoldingSnapshots,
} from "@/db/schema";

/**
 * $PULSE reward logic. Named lib/staking.js (not lib/tokens.js — that's the email
 * OTP module). Mirrors lib/brand-wallet.js: a holder's reward balance is always
 * DERIVED from the append-only ledger + claims, never stored, so there is no
 * double-write or drift risk. All amounts are BASE UNITS as BigInt (a 1e18-unit
 * supply exceeds JS Number's 2^53, so we never coerce to Number).
 *
 *   earned    = Σ(accrue) + Σ(adjust)                 // adjust = admin grant (+)
 *   reversed  = Σ(reversal)                            // fraud clawback / correction (−)
 *   claimed   = Σ(claims WHERE status <> 'failed')     // pending+paid both hold funds
 *   available = earned − reversed − claimed            // never stored
 *
 * A failed claim returns its amount to available (it stops counting), exactly like
 * a failed withdrawal returns to a creator's balance.
 */

/** Coerce a pg SUM (numeric → string) / number / bigint to an exact BigInt. */
function toBig(v) {
  if (typeof v === "bigint") return v;
  if (typeof v === "number") return BigInt(Math.trunc(v));
  return BigInt(String(v ?? "0").split(".")[0] || "0");
}

/**
 * Derived reward totals for a user, all BigInt base units. Call this while the
 * user's row is locked in the enclosing transaction when the result gates a write
 * (a claim), so two concurrent claims can't both pass the balance check.
 */
export async function getTokenRewardTotals(client, userId) {
  const [ledger] = await client
    .select({
      earned: sql`coalesce(sum(case when ${tokenRewardLedger.action} in ('accrue','adjust') then ${tokenRewardLedger.amount} else 0 end), 0)`,
      reversed: sql`coalesce(sum(case when ${tokenRewardLedger.action} = 'reversal' then ${tokenRewardLedger.amount} else 0 end), 0)`,
    })
    .from(tokenRewardLedger)
    .where(eq(tokenRewardLedger.userId, userId));

  const [claims] = await client
    .select({
      claimed: sql`coalesce(sum(case when ${tokenClaims.status} <> 'failed' then ${tokenClaims.amount} else 0 end), 0)`,
    })
    .from(tokenClaims)
    .where(eq(tokenClaims.userId, userId));

  const earnedBase = toBig(ledger?.earned);
  const reversedBase = toBig(ledger?.reversed);
  const claimedBase = toBig(claims?.claimed);
  let availableBase = earnedBase - reversedBase - claimedBase;
  if (availableBase < 0n) availableBase = 0n; // defensive; the math can't go negative

  return { earnedBase, reversedBase, claimedBase, availableBase };
}

/** The idempotency key for a daily accrual run: "accrue:YYYY-MM-DD" (UTC). */
export function dailyPeriodKey(date = new Date()) {
  return `accrue:${date.toISOString().slice(0, 10)}`;
}

/**
 * Accrue one period of hold-to-earn reward for a user, inside a transaction.
 *
 * Anti-gaming: the reward is computed on the MIN of the previous and current
 * snapshot balance, so topping up right before a run — or draining right after —
 * earns nothing for that spike. The very first run for a user has no prior
 * snapshot, so it earns 0 and just establishes the baseline: you must hold across
 * a full interval before earning.
 *
 * Idempotent per (user, period): if an 'accrue' row already exists for periodKey
 * (the partial-unique index also enforces this at the DB), the run is a no-op, so
 * a double-fire of the cron can't pay a period twice.
 *
 * @returns {Promise<{skipped:boolean, reward:bigint, minBalance:bigint, prevBalance:bigint}>}
 */
export async function accrueForUser(tx, { userId, wallet, currentBalanceBase, rewardRatePpm, periodKey }) {
  const current = typeof currentBalanceBase === "bigint" ? currentBalanceBase : toBig(currentBalanceBase);
  const ppm = BigInt(Math.max(0, Math.trunc(Number(rewardRatePpm) || 0)));

  // Already accrued for this period → nothing to do (belt-and-suspenders with the
  // DB unique index; lets us also avoid a duplicate snapshot on a re-run).
  const existing = await tx
    .select({ id: tokenRewardLedger.id })
    .from(tokenRewardLedger)
    .where(
      and(
        eq(tokenRewardLedger.userId, userId),
        eq(tokenRewardLedger.action, "accrue"),
        eq(tokenRewardLedger.reference, periodKey)
      )
    )
    .limit(1);
  if (existing.length) return { skipped: true, reward: 0n, minBalance: 0n, prevBalance: 0n };

  // Prior snapshot (before we insert this run's). No prior → baseline of 0.
  const [prevSnap] = await tx
    .select({ balance: tokenHoldingSnapshots.balance })
    .from(tokenHoldingSnapshots)
    .where(eq(tokenHoldingSnapshots.userId, userId))
    .orderBy(desc(tokenHoldingSnapshots.takenAt))
    .limit(1);
  const prevBalance = prevSnap ? toBig(prevSnap.balance) : 0n;

  const minBalance = prevBalance < current ? prevBalance : current;
  const reward = ppm > 0n ? (minBalance * ppm) / 1_000_000n : 0n;

  // Always record the snapshot (audit trail behind the accrual).
  await tx.insert(tokenHoldingSnapshots).values({ userId, wallet, balance: current });

  if (reward > 0n) {
    await tx
      .insert(tokenRewardLedger)
      .values({ userId, action: "accrue", amount: reward, reference: periodKey, note: null })
      .onConflictDoNothing();
  }

  return { skipped: false, reward, minBalance, prevBalance };
}
