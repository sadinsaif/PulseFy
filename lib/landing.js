import { db } from "@/db";
import { campaigns, submissions, users, withdrawals } from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";

/**
 * Public landing-page data — server-only, no session required.
 *
 * Everything here is REAL data, read straight from the database, and is
 * deliberately scoped to what is safe to show a logged-out visitor:
 *
 *   • Only NON-BRAND users who have public-safe approved work are featured
 *     (same boundary as the existing public creator directory).
 *   • Only ACTIVE, PUBLIC, not-yet-ended campaigns are listed.
 *   • Activity + earnings never leak from a PRIVATE campaign or one that hides
 *     contributions (the shared `publicContribution` guard, copied verbatim
 *     from /api/creators).
 *
 * If the platform has little/no data yet, the queries simply return empty
 * arrays / zeros and the page renders honest empty states — we never fabricate
 * creators, campaigns, or statistics.
 *
 * The whole thing is wrapped in try/catch so a transient DB hiccup degrades to
 * empty states instead of a 500 on the homepage.
 */

// A submission counts toward public discovery only when it is not tied to a
// private campaign (or one that hides its contributions). Verbatim from the
// creators API so the public boundary stays identical everywhere.
const publicContribution = sql`(
  submissions.campaign_id is null or exists (
    select 1 from campaigns c
    where c.id = submissions.campaign_id
      and c.visibility is distinct from 'private'
      and c.show_contributions is distinct from 'no'
  )
)`;

const approvedCount = sql`(select count(*) from submissions where submissions.user_id = ${users.id} and submissions.status = 'approved' and ${publicContribution})`;
const rejectedCount = sql`(select count(*) from submissions where submissions.user_id = ${users.id} and submissions.status = 'rejected' and ${publicContribution})`;
const earningsExpr = sql`(
  (select coalesce(sum(reward),0) from submissions where submissions.user_id = ${users.id} and submissions.status = 'approved' and ${publicContribution})
  + (select coalesce(sum(spotlight_bonus),0) from submissions where submissions.user_id = ${users.id} and submissions.spotlighted = true and ${publicContribution})
)`;
const notBrand = sql`${users.role} is distinct from 'brand'`;

// Only a campaign that is public-safe may contribute to the activity feed.
const publicCampaignForActivity = sql`(
  ${submissions.campaignId} is null or exists (
    select 1 from campaigns cc
    where cc.id = ${submissions.campaignId}
      and cc.visibility is distinct from 'private'
      and cc.show_contributions is distinct from 'no'
  )
)`;

const EMPTY = {
  stats: { creators: 0, activeCampaigns: 0, paidOut: 0, approvedPosts: 0 },
  creators: [],
  campaigns: [],
  activity: [],
  hasData: false,
};

export async function getLandingData() {
  try {
    const [
      statCreators,
      statCampaigns,
      statPaid,
      statApproved,
      creatorRows,
      campaignRows,
      activityRows,
    ] = await Promise.all([
      // --- Platform stats (aggregate, public-safe) ---------------------------
      db
        .select({ n: sql`count(*)` })
        .from(users)
        .where(notBrand),
      db
        .select({ n: sql`count(*)` })
        .from(campaigns)
        .where(
          sql`${campaigns.status} = 'active' and ${campaigns.visibility} is distinct from 'private' and (${campaigns.endsAt} is null or ${campaigns.endsAt} > now())`
        ),
      db
        .select({ cents: sql`coalesce(sum(${withdrawals.net}),0)` })
        .from(withdrawals)
        .where(eq(withdrawals.status, "paid")),
      db
        .select({ n: sql`count(*)` })
        .from(submissions)
        .where(sql`${submissions.status} = 'approved' and ${publicCampaignForActivity}`),

      // --- Featured creators (real, only those with public approved work) ----
      db
        .select({
          id: users.id,
          name: users.name,
          username: users.username,
          image: users.image,
          isVerified: users.isVerified,
          bio: users.bio,
          approved: approvedCount,
          rejected: rejectedCount,
          earnings: earningsExpr,
        })
        .from(users)
        .where(and(notBrand, sql`${approvedCount} > 0`))
        .orderBy(desc(earningsExpr), desc(approvedCount))
        .limit(6),

      // --- Live campaigns (active, public, not ended) ------------------------
      db
        .select({
          id: campaigns.id,
          title: campaigns.title,
          brief: campaigns.brief,
          reward: campaigns.reward,
          platform: campaigns.platform,
          contentType: campaigns.contentType,
          thumbnailUrl: campaigns.thumbnailUrl,
          endsAt: campaigns.endsAt,
          budget: campaigns.budget,
          budgetSpent: campaigns.budgetSpent,
          brandName: users.name,
          brandVerified: users.isVerified,
          submissionCount: sql`(select count(*) from submissions where submissions.campaign_id = ${campaigns.id})`,
        })
        .from(campaigns)
        .leftJoin(users, eq(campaigns.brandId, users.id))
        .where(
          sql`${campaigns.status} = 'active' and ${campaigns.visibility} is distinct from 'private' and (${campaigns.endsAt} is null or ${campaigns.endsAt} > now())`
        )
        .orderBy(desc(campaigns.createdAt))
        .limit(6),

      // --- Recent public-safe approved activity ------------------------------
      db
        .select({
          reward: submissions.reward,
          spotlightBonus: submissions.spotlightBonus,
          spotlighted: submissions.spotlighted,
          platform: submissions.platform,
          createdAt: submissions.createdAt,
          challengeId: submissions.challengeId,
          creatorName: users.name,
          creatorUsername: users.username,
          creatorImage: users.image,
          creatorVerified: users.isVerified,
          campaignTitle: campaigns.title,
        })
        .from(submissions)
        .innerJoin(users, eq(submissions.userId, users.id))
        .leftJoin(campaigns, eq(campaigns.id, submissions.campaignId))
        .where(sql`${submissions.status} = 'approved' and ${notBrand} and ${publicCampaignForActivity}`)
        .orderBy(desc(submissions.createdAt))
        .limit(8),
    ]);

    const stats = {
      creators: Number(statCreators?.[0]?.n || 0),
      activeCampaigns: Number(statCampaigns?.[0]?.n || 0),
      paidOut: Math.round(Number(statPaid?.[0]?.cents || 0) / 100),
      approvedPosts: Number(statApproved?.[0]?.n || 0),
    };

    const creators = creatorRows.map((c) => {
      const approved = Number(c.approved || 0);
      const rejected = Number(c.rejected || 0);
      const decided = approved + rejected;
      return {
        id: c.id,
        name: c.name || c.username || "Creator",
        username: c.username || null,
        image: c.image || null,
        isVerified: Boolean(c.isVerified),
        bio: c.bio || null,
        approved,
        earnings: Number(c.earnings || 0),
        approvalRate: decided > 0 ? Math.round((approved / decided) * 100) : null,
      };
    });

    const campaignList = campaignRows.map((c) => ({
      id: c.id,
      title: c.title,
      brief: c.brief || null,
      reward: Number(c.reward || 0),
      platform: c.platform || "any",
      contentType: c.contentType || null,
      thumbnailUrl: c.thumbnailUrl || null,
      endsAt: c.endsAt ? new Date(c.endsAt).toISOString() : null,
      budget: Number(c.budget || 0),
      budgetSpent: Number(c.budgetSpent || 0),
      brandName: c.brandName || "A brand",
      brandVerified: Boolean(c.brandVerified),
      submissionCount: Number(c.submissionCount || 0),
    }));

    const activity = activityRows.map((a) => ({
      creatorName: a.creatorName || a.creatorUsername || "A creator",
      creatorImage: a.creatorImage || null,
      creatorVerified: Boolean(a.creatorVerified),
      campaignTitle: a.campaignTitle || a.challengeId || "a campaign",
      reward: Number(a.reward || 0),
      spotlightBonus: Number(a.spotlightBonus || 0),
      spotlighted: Boolean(a.spotlighted),
      platform: a.platform || "any",
      createdAt: a.createdAt ? new Date(a.createdAt).toISOString() : null,
    }));

    const hasData =
      creators.length > 0 ||
      campaignList.length > 0 ||
      stats.activeCampaigns > 0 ||
      stats.paidOut > 0 ||
      stats.approvedPosts > 0;

    return { stats, creators, campaigns: campaignList, activity, hasData };
  } catch {
    // DB unavailable → render honest empty states, never a broken homepage.
    return EMPTY;
  }
}
