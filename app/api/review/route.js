export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { campaignFundingLedger, campaigns, submissions, users } from "@/db/schema";
import { getCampaignFundingTotals } from "@/lib/campaign-funding";
import { getCreatorBalanceCents } from "@/lib/creator-balance";
import { reviewSchema } from "@/lib/validation";
import { isAdminEmail } from "@/lib/admin";
import { notifyUser } from "@/lib/notify";

function failure(message, status) { const error = new Error(message); error.status = status; return error; }
function committed(submission) {
  if (submission.status !== "approved") return 0;
  return (Number(submission.reward) || 0) + (submission.spotlighted ? Number(submission.spotlightBonus) || 0 : 0);
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const [viewer] = await db.select({ role: users.role }).from(users).where(eq(users.id, session.user.id));
  const admin = isAdminEmail(session.user.email);
  if (!admin && viewer?.role !== "brand") return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const cols = { id: submissions.id, challengeId: submissions.challengeId, campaignId: submissions.campaignId, platform: submissions.platform, postUrl: submissions.postUrl, caption: submissions.caption, status: submissions.status, reward: submissions.reward, views: submissions.views, engagement: submissions.engagement, spotlighted: submissions.spotlighted, spotlightBonus: submissions.spotlightBonus, createdAt: submissions.createdAt, creatorId: submissions.userId, creatorName: users.name, creatorEmail: users.email, campaignReward: sql`(select reward from campaigns where campaigns.id = ${submissions.campaignId})` };
  const base = db.select(cols).from(submissions).leftJoin(users, eq(submissions.userId, users.id));
  const rows = admin ? await base.orderBy(desc(submissions.createdAt)) : await base.innerJoin(campaigns, eq(submissions.campaignId, campaigns.id)).where(eq(campaigns.brandId, session.user.id)).orderBy(desc(submissions.createdAt));
  return NextResponse.json({ submissions: rows });
}

export async function POST(req) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const [viewer] = await db.select({ role: users.role }).from(users).where(eq(users.id, session.user.id));
  const admin = isAdminEmail(session.user.email);
  if (!admin && viewer?.role !== "brand") return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  let body; try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid input" }, { status: 400 });
  const { submissionId, status, views, engagement, spotlighted } = parsed.data;
  let result;
  try {
    result = await db.transaction(async (tx) => {
      // Lock both state rows before deriving the exact server-owned commitment.
      const [submission] = await tx.select().from(submissions).where(eq(submissions.id, submissionId)).for("update");
      if (!submission) throw failure("Submission not found", 404);
      if (!submission.campaignId) throw failure("Submission is not attached to a campaign.", 409);
      if (submission.userId === session.user.id) throw failure("You cannot review your own submission.", 403);
      const [campaign] = await tx.select().from(campaigns).where(eq(campaigns.id, submission.campaignId)).for("update");
      if (!campaign) throw failure("Campaign not found", 404);
      if (!admin && campaign.brandId !== session.user.id) throw failure("Not your campaign.", 403);

      const patch = { status };
      if (views != null) patch.views = views;
      if (engagement != null) patch.engagement = engagement;
      // Client reward fields are intentionally ignored. Any non-approved state
      // clears all campaign earnings, including a former spotlight bonus.
      if (status === "approved") {
        patch.reward = campaign.reward;
        patch.spotlighted = spotlighted == null ? submission.spotlighted : spotlighted;
        patch.spotlightBonus = patch.spotlighted ? campaign.spotlightReward : 0;
      } else {
        patch.reward = 0;
        patch.spotlighted = false;
        patch.spotlightBonus = 0;
      }

      const next = { ...submission, ...patch };
      const delta = committed(next) - committed(submission);
      if (delta > 0 && (
        campaign.status !== "active" ||
        (campaign.endsAt && new Date(campaign.endsAt).getTime() <= Date.now())
      )) {
        throw failure("This campaign is closed and cannot approve new rewards.", 409);
      }
      const funding = await getCampaignFundingTotals(tx, campaign.id);
      if (delta > 0 && (delta > funding.available || delta > Number(campaign.budget) - Number(campaign.budgetSpent))) {
        throw failure("Insufficient verified campaign funding.", 409);
      }
      if (delta < 0) {
        // Serialize a reversal with withdrawals. Funds already reserved for a
        // pending/paid withdrawal cannot be silently removed from a creator.
        const [creator] = await tx.select({ id: users.id }).from(users)
          .where(eq(users.id, submission.userId)).for("update");
        if (!creator) throw failure("Creator not found", 404);
        const balance = await getCreatorBalanceCents(tx, creator.id);
        if (balance.availableCents + delta * 100 < 0) {
          throw failure("This reward cannot be reversed because the creator has already withdrawn the funds.", 409);
        }
      }

      await tx.update(submissions).set(patch).where(eq(submissions.id, submission.id));
      if (delta) {
        await tx.update(campaigns).set({ budgetSpent: Number(campaign.budgetSpent) + delta }).where(eq(campaigns.id, campaign.id));
        await tx.insert(campaignFundingLedger).values({
          campaignId: campaign.id,
          submissionId: submission.id,
          actorId: session.user.id,
          action: delta > 0 ? "spend" : "reversal",
          amount: Math.abs(delta),
        });
      }
      return { submission, next, delta, funding: { ...funding, available: funding.available - delta } };
    });
  } catch (error) { if (error.status) return NextResponse.json({ error: error.message }, { status: error.status }); throw error; }
  if ((status === "approved" || status === "rejected") && status !== result.submission.status) await notifyUser(result.submission.userId, { type: "review", message: `Your submission to ${result.submission.challengeId} was ${status === "approved" ? `approved ✅ — you earned $${result.next.reward}` : "rejected"}.`, link: "/dashboard/profile" });
  if (result.next.spotlighted && result.next.spotlightBonus > 0 && (!result.submission.spotlighted || result.next.spotlightBonus !== result.submission.spotlightBonus)) await notifyUser(result.submission.userId, { type: "review", message: `✦ Your post to ${result.submission.challengeId} was Spotlighted! You earned a $${result.next.spotlightBonus} bonus.`, link: "/dashboard/profile" });
  return NextResponse.json({ ok: true, status, reward: result.next.reward, spotlighted: result.next.spotlighted, spotlightBonus: result.next.spotlightBonus });
}
