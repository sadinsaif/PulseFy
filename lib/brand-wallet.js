import { and, eq, sql } from "drizzle-orm";
import {
  brandTopups,
  brandWalletLedger,
  campaigns,
  campaignFundingLedger,
} from "@/db/schema";

/**
 * Brand wallet balances are DERIVED from append-only records, never stored as a
 * mutable column — this avoids the floating-point / double-write risks of a
 * running balance. All amounts are whole-dollar integers (USD).
 *
 * A campaign with a reserve row is either ACTIVE (still live or paused) or SETTLED
 * (it has ENDED). "Settled" is keyed off the campaign's ended STATUS, not the
 * presence of a release row: a campaign that ends fully-spent (unused == 0) gets
 * no release row, so keying off the row would misclassify it as active forever and
 * strand a later clawback's reclaimed dollars in Reserved. A release row always
 * implies ended, so it is kept as a defensive OR. Neither the release row's amount
 * nor its existence drives the math — budget_spent is always read LIVE. This keeps
 * the numbers correct when a reward is reversed AFTER a campaign has ended (a fraud
 * clawback): the reclaimed dollars flow back to Available, never stranded.
 *
 *   spentActive   = Σ(budget_spent) over ACTIVE  reserve campaigns
 *   spentSettled  = Σ(budget_spent) over SETTLED reserve campaigns  (live)
 *   reserveActive = Σ(reserve amount) over ACTIVE reserve campaigns
 *
 *   available = Σ(completed top-ups) − reserveActive − spentSettled
 *   reserved  = reserveActive − spentActive        // unspent, still-held budget
 *   total     = available + reserved = Σ(top-ups) − Σ(all budget_spent)
 *
 * Balances never go negative: budget_spent is CHECK-capped at ≤ budget (= the
 * reserve amount), so every per-campaign reserved contribution is ≥ 0; the launch
 * gate prevents reserving more than Available.
 *
 * Call this while the brand's user row is locked in the enclosing transaction
 * when the result gates a write (launch/release), so concurrent launches can't
 * both pass the balance check.
 */
export async function getBrandWalletTotals(client, brandId) {
  // Completed top-ups only — pending/processing/failed/cancelled never count (§5).
  const [topupRow] = await client
    .select({
      completed: sql`coalesce(sum(case when ${brandTopups.status} = 'completed' then ${brandTopups.amount} else 0 end), 0)`,
    })
    .from(brandTopups)
    .where(eq(brandTopups.brandId, brandId));

  // Per-campaign wallet movements over exactly the campaigns that hold a reserve
  // row, split by whether the campaign has settled (ENDED). We read budget_spent
  // LIVE for both groups — see the header note on reversal safety.
  const isSettled = sql`(${campaigns.status} = 'ended' or exists (select 1 from brand_wallet_ledger rl where rl.campaign_id = ${campaigns.id} and rl.action = 'release'))`;
  const reserveAmt = sql`coalesce((select l.amount from brand_wallet_ledger l where l.campaign_id = ${campaigns.id} and l.action = 'reserve' limit 1), 0)`;
  const [walletRow] = await client
    .select({
      reserveActive: sql`coalesce(sum(case when not ${isSettled} then ${reserveAmt} else 0 end), 0)`,
      spentActive: sql`coalesce(sum(case when not ${isSettled} then ${campaigns.budgetSpent} else 0 end), 0)`,
      spentSettled: sql`coalesce(sum(case when ${isSettled} then ${campaigns.budgetSpent} else 0 end), 0)`,
    })
    .from(campaigns)
    .where(
      and(
        eq(campaigns.brandId, brandId),
        sql`exists (select 1 from brand_wallet_ledger l where l.campaign_id = ${campaigns.id} and l.action = 'reserve')`
      )
    );

  const topupsCompleted = Number(topupRow?.completed || 0);
  const reserveActive = Number(walletRow?.reserveActive || 0);
  const spentActive = Number(walletRow?.spentActive || 0);
  const spentSettled = Number(walletRow?.spentSettled || 0);

  // available: top-ups, minus budget still held for active campaigns, minus money
  // that has actually left the wallet on settled campaigns (their unused portion
  // already returned). reserved: only the unspent, still-held budget of active
  // campaigns — a settled campaign always contributes 0.
  const available = topupsCompleted - reserveActive - spentSettled;
  const reserved = reserveActive - spentActive;
  const total = available + reserved;

  return {
    available,
    reserved,
    total,
    topupsCompleted,
    reserveActive,
    spentActive,
    spentSettled,
  };
}

/**
 * Brand-scoped, read-only transaction history unioned from the real records that
 * already exist — no synthetic rows (§20). Sources:
 *   - Top Up            ← brand_topups (all statuses; carries its own badge)
 *   - Campaign Budget Reserved / Budget Released ← brand_wallet_ledger
 *   - Creator Payout / Payout Reversed ← campaign_funding_ledger spend/reversal
 *                         rows on this brand's campaigns (recorded once by the
 *                         review route; NOT duplicated here — §13)
 * Refund is intentionally omitted — no refund flow exists (§12).
 *
 * `filter`: "all" | "topups" | "campaigns" | "payouts".
 */
export async function getBrandTransactions(client, brandId, filter = "all") {
  const out = [];

  if (filter === "all" || filter === "topups") {
    const rows = await client
      .select({
        id: brandTopups.id,
        amount: brandTopups.amount,
        status: brandTopups.status,
        createdAt: brandTopups.createdAt,
      })
      .from(brandTopups)
      .where(eq(brandTopups.brandId, brandId));
    for (const r of rows) {
      out.push({
        id: `topup:${r.id}`,
        date: r.createdAt,
        type: "Top Up",
        typeKey: "topup",
        campaign: null,
        campaignId: null,
        amount: Number(r.amount),
        status: r.status,
      });
    }
  }

  if (filter === "all" || filter === "campaigns") {
    const rows = await client
      .select({
        id: brandWalletLedger.id,
        action: brandWalletLedger.action,
        amount: brandWalletLedger.amount,
        createdAt: brandWalletLedger.createdAt,
        campaignId: brandWalletLedger.campaignId,
        title: campaigns.title,
      })
      .from(brandWalletLedger)
      .leftJoin(campaigns, eq(brandWalletLedger.campaignId, campaigns.id))
      .where(eq(brandWalletLedger.brandId, brandId));
    for (const r of rows) {
      const isReserve = r.action === "reserve";
      out.push({
        id: `wallet:${r.id}`,
        date: r.createdAt,
        type: isReserve ? "Campaign Budget Reserved" : "Budget Released",
        typeKey: r.action,
        campaign: r.title || null,
        campaignId: r.campaignId,
        // A reserve leaves Available (shown negative); a release returns to it.
        amount: isReserve ? -Number(r.amount) : Number(r.amount),
        status: "completed",
      });
    }
  }

  if (filter === "all" || filter === "payouts") {
    const rows = await client
      .select({
        id: campaignFundingLedger.id,
        action: campaignFundingLedger.action,
        amount: campaignFundingLedger.amount,
        createdAt: campaignFundingLedger.createdAt,
        campaignId: campaignFundingLedger.campaignId,
        title: campaigns.title,
      })
      .from(campaignFundingLedger)
      .innerJoin(campaigns, eq(campaignFundingLedger.campaignId, campaigns.id))
      .where(
        and(
          eq(campaigns.brandId, brandId),
          sql`${campaignFundingLedger.action} in ('spend', 'reversal')`
        )
      );
    for (const r of rows) {
      const isSpend = r.action === "spend";
      out.push({
        id: `spend:${r.id}`,
        date: r.createdAt,
        type: isSpend ? "Creator Payout" : "Payout Reversed",
        typeKey: r.action,
        campaign: r.title || null,
        campaignId: r.campaignId,
        amount: isSpend ? -Number(r.amount) : Number(r.amount),
        status: "completed",
      });
    }
  }

  out.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return out;
}
