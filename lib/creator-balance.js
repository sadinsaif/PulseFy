import { and, eq, sql } from "drizzle-orm";
import { referralEarnings, submissions, withdrawals } from "@/db/schema";

/**
 * Server-side creator balance in cents. A campaign claim counts only when its
 * current approved reward/bonus is covered by net immutable ledger spending.
 */
export async function getCreatorBalanceCents(client, userId) {
  const ledgerBackedClaim = sql`exists (
    select 1 from campaign_funding_ledger l
    where l.submission_id = ${submissions.id}
    group by l.submission_id
    having coalesce(sum(case when l.action = 'spend' then l.amount when l.action = 'reversal' then -l.amount else 0 end), 0) >=
      ${submissions.reward} + case when ${submissions.spotlighted} then ${submissions.spotlightBonus} else 0 end
  )`;
  const [rewards] = await client.select({ n: sql`coalesce(sum(${submissions.reward}), 0)` })
    .from(submissions)
    .where(and(eq(submissions.userId, userId), eq(submissions.status, "approved"), ledgerBackedClaim));
  const [spotlights] = await client.select({ n: sql`coalesce(sum(${submissions.spotlightBonus}), 0)` })
    .from(submissions)
    .where(and(eq(submissions.userId, userId), eq(submissions.status, "approved"), eq(submissions.spotlighted, true), ledgerBackedClaim));
  const [referrals] = await client.select({ n: sql`coalesce(sum(${referralEarnings.amount}), 0)` })
    .from(referralEarnings).where(eq(referralEarnings.referrerId, userId));
  const [withdrawn] = await client.select({ n: sql`coalesce(sum(${withdrawals.amount}), 0)` })
    .from(withdrawals).where(and(eq(withdrawals.userId, userId), sql`${withdrawals.status} <> 'failed'`));

  const earnedCents = (Number(rewards?.n || 0) + Number(spotlights?.n || 0)) * 100 + Number(referrals?.n || 0);
  const drawnCents = Number(withdrawn?.n || 0);
  return { earnedCents, drawnCents, availableCents: earnedCents - drawnCents };
}
