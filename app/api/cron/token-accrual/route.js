export const dynamic = "force-dynamic";
// On-chain reads + a row per holder: give the run generous headroom.
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { eq, isNotNull } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { tokenWallets } from "@/db/schema";
import { isAdminEmail } from "@/lib/admin";
import { getSplBalanceBase, isTokenConfigured } from "@/lib/solana";
import { accrueForUser, dailyPeriodKey } from "@/lib/staking";

/**
 * GET /api/cron/token-accrual — take a balance snapshot for every verified wallet
 * and accrue one period of hold-to-earn reward. Idempotent per (user, day): a
 * second run on the same day is a no-op, so Vercel retries are safe.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. An admin session
 * may also trigger it manually. Wire the schedule in vercel.json.
 */
export async function GET(req) {
  // --- Authorize: cron secret OR an admin session. --------------------------
  const secret = process.env.CRON_SECRET;
  const authz = req.headers.get("authorization") || "";
  const isCron = Boolean(secret) && authz === `Bearer ${secret}`;
  if (!isCron) {
    const session = await auth();
    if (!session?.user?.id || !isAdminEmail(session.user.email)) {
      return NextResponse.json({ error: "Not allowed" }, { status: 401 });
    }
  }

  if (!isTokenConfigured()) {
    return NextResponse.json({ ok: true, skipped: "token not configured", accrued: 0, wallets: 0 });
  }

  const rewardRatePpm = Number(process.env.TOKEN_REWARD_RATE_PPM || 0);
  const periodKey = dailyPeriodKey();

  const wallets = await db
    .select({ userId: tokenWallets.userId, wallet: tokenWallets.wallet })
    .from(tokenWallets)
    .where(isNotNull(tokenWallets.verifiedAt));

  let accrued = 0;
  let skipped = 0;
  let errors = 0;
  let totalReward = 0n;

  // Sequential: keeps us well under public-RPC rate limits. For a large holder
  // base, move to a batched/paged run or a dedicated RPC — noted, not hidden.
  for (const w of wallets) {
    try {
      const currentBalanceBase = await getSplBalanceBase(w.wallet);
      const res = await db.transaction((tx) =>
        accrueForUser(tx, {
          userId: w.userId,
          wallet: w.wallet,
          currentBalanceBase,
          rewardRatePpm,
          periodKey,
        })
      );
      if (res.skipped) skipped += 1;
      else {
        accrued += 1;
        totalReward += res.reward;
      }
    } catch (e) {
      errors += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    period: periodKey,
    rewardRatePpm,
    wallets: wallets.length,
    accrued,
    skipped,
    errors,
    totalRewardBase: totalReward.toString(),
  });
}
