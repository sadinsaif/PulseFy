import { eq, sql } from "drizzle-orm";
import { campaignFundingLedger } from "@/db/schema";

/**
 * Totals are derived from append-only ledger rows. Call this only while the
 * corresponding campaign row is locked in the enclosing transaction.
 */
export async function getCampaignFundingTotals(client, campaignId) {
  const [row] = await client.select({
    funded: sql`coalesce(sum(case when ${campaignFundingLedger.action} = 'funding' then ${campaignFundingLedger.amount} else 0 end), 0)`,
    reserved: sql`coalesce(sum(case when ${campaignFundingLedger.action} = 'reserve' then ${campaignFundingLedger.amount} when ${campaignFundingLedger.action} = 'release' then -${campaignFundingLedger.amount} else 0 end), 0)`,
    spent: sql`coalesce(sum(case when ${campaignFundingLedger.action} = 'spend' then ${campaignFundingLedger.amount} when ${campaignFundingLedger.action} = 'reversal' then -${campaignFundingLedger.amount} else 0 end), 0)`,
  }).from(campaignFundingLedger).where(eq(campaignFundingLedger.campaignId, campaignId));

  const funded = Number(row?.funded || 0);
  const reserved = Number(row?.reserved || 0);
  const spent = Number(row?.spent || 0);
  return { funded, reserved, spent, available: funded - reserved - spent };
}

export function fundingStatus({ budget, funded, reserved, spent }) {
  if (!funded) return "funding_pending";
  if (spent + reserved >= funded) return "exhausted";
  if (funded < Number(budget || 0)) return "partially_funded";
  return "funded";
}
