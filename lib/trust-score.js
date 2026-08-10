import { and, eq, sql } from "drizzle-orm";
import { campaigns, moderationEvents, reviews, submissions, users } from "@/db/schema";

/**
 * Deterministic, server-only trust score. It starts neutral and rewards real,
 * completed work and public review quality. Only confirmed moderation actions
 * reduce the score; allegations/reports are deliberately not counted.
 */
export async function getTrustScore(db, userId) {
  const [user] = await db.select({ id: users.id, role: users.role, isVerified: users.isVerified })
    .from(users).where(eq(users.id, userId));
  if (!user) return null;

  const [reviewStats] = await db.select({
    count: sql`count(*)`, average: sql`coalesce(round(avg(${reviews.rating})::numeric, 2), 0)`,
    one: sql`count(*) filter (where ${reviews.rating} = 1)`, two: sql`count(*) filter (where ${reviews.rating} = 2)`,
    three: sql`count(*) filter (where ${reviews.rating} = 3)`, four: sql`count(*) filter (where ${reviews.rating} = 4)`,
    five: sql`count(*) filter (where ${reviews.rating} = 5)`,
  }).from(reviews)
    .innerJoin(campaigns, eq(reviews.campaignId, campaigns.id))
    .innerJoin(users, eq(reviews.reviewerId, users.id))
    .where(and(
      eq(reviews.revieweeId, userId),
      eq(reviews.status, "visible"),
      sql`${campaigns.visibility} is distinct from 'private'`,
      sql`${users.moderationStatus} not in ('suspended', 'banned')`
    ));

  const completedCampaigns = user.role === "brand"
    ? sql`(select count(distinct c.id) from campaigns c join submissions s on s.campaign_id = c.id and s.status = 'approved' where c.brand_id = ${userId} and c.visibility is distinct from 'private' and (c.status = 'ended' or c.ends_at <= now()))`
    : sql`(select count(distinct c.id) from submissions s join campaigns c on c.id = s.campaign_id where s.user_id = ${userId} and s.status = 'approved' and c.visibility is distinct from 'private' and (c.status = 'ended' or c.ends_at <= now()))`;
  const successfulSubmissions = user.role === "creator"
    ? sql`(select count(*) from submissions s left join campaigns c on c.id = s.campaign_id where s.user_id = ${userId} and s.status = 'approved' and (s.campaign_id is null or c.visibility is distinct from 'private'))`
    : sql`0`;
  const [activity] = await db.select({ completedCampaigns, successfulSubmissions }).from(users).where(eq(users.id, userId));
  const [moderation] = await db.select({
    warnings: sql`count(*) filter (where ${moderationEvents.action} = 'warning')`,
    severe: sql`count(*) filter (where ${moderationEvents.action} in ('suspension', 'ban'))`,
  }).from(moderationEvents).where(eq(moderationEvents.targetUserId, userId));

  const completed = Number(activity?.completedCampaigns || 0);
  const successful = Number(activity?.successfulSubmissions || 0);
  const count = Number(reviewStats?.count || 0);
  const averageRating = Number(reviewStats?.average || 0);
  const warningPenalty = Math.min(Number(moderation?.warnings || 0) * 2, 8);
  const severePenalty = Math.min(Number(moderation?.severe || 0) * 8, 16);
  const hasActivity = completed > 0 || successful > 0 || count > 0;
  const score = hasActivity
    ? Math.max(0, Math.min(100, Math.round(
      50 + Math.min(completed * 3, 18) + Math.min(successful * 2, 12) +
      (count ? Math.round((averageRating - 3) * 5) : 0) + Math.min(count, 4) +
      (user.isVerified ? 8 : 0) - warningPenalty - severePenalty
    )))
    : null;

  return {
    score, limitedData: !hasActivity, verified: Boolean(user.isVerified),
    averageRating, reviewCount: count,
    distribution: { 1: Number(reviewStats?.one || 0), 2: Number(reviewStats?.two || 0), 3: Number(reviewStats?.three || 0), 4: Number(reviewStats?.four || 0), 5: Number(reviewStats?.five || 0) },
    completedCampaigns: completed, successfulSubmissions: successful,
    // Expose only public, high-level factors; never notes, reports, or event details.
    explanation: "Calculated from completed work, approved submissions, visible ratings, review volume, verification, and confirmed moderation actions.",
  };
}
