export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { campaigns, users, submissions, follows } from "@/db/schema";
import { canViewCampaignContributions, participantCampaignIds } from "@/lib/campaign-access";
import { and, desc, eq, sql } from "drizzle-orm";

/**
 * GET /api/creators/[id]
 * Public profile of one creator: their profile fields, aggregate stats, and
 * their approved clips (portfolio). Any signed-in user can view it.
 */
export async function GET(_req, { params }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const rows = await db
    .select({
      creatorId: users.id,
      id: users.id,
      name: users.name,
      username: users.username,
      image: users.image,
      bio: users.bio,
      twitter: users.twitter,
      instagram: users.instagram,
      interests: users.interests,
    })
    .from(users)
    .where(and(eq(users.id, params.id), eq(users.role, "creator")));

  const profile = rows[0];
  if (!profile) {
    return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  }

  const all = await db
    .select({
      id: submissions.id,
      challengeId: submissions.challengeId,
      platform: submissions.platform,
      postUrl: submissions.postUrl,
      status: submissions.status,
      reward: submissions.reward,
      views: submissions.views,
      engagement: submissions.engagement,
      spotlighted: submissions.spotlighted,
      spotlightBonus: submissions.spotlightBonus,
      createdAt: submissions.createdAt,
      campaignId: submissions.campaignId,
      campaignRecordId: campaigns.id,
      brandId: campaigns.brandId,
      visibility: campaigns.visibility,
      showContributions: campaigns.showContributions,
    })
    .from(submissions)
    .leftJoin(campaigns, eq(submissions.campaignId, campaigns.id))
    .where(eq(submissions.userId, params.id))
    .orderBy(desc(submissions.createdAt));

  const participantIds = await participantCampaignIds(session.user.id, [...new Set(all.map((row) => row.campaignId).filter(Boolean))]);
  const visible = all.filter((row) =>
    !row.campaignId || (row.campaignRecordId && canViewCampaignContributions(row, session, participantIds))
  );
  const approvedRows = visible.filter((s) => s.status === "approved");
  const rejected = visible.filter((s) => s.status === "rejected").length;
  const reviewed = approvedRows.length + rejected;
  // Earnings = approved campaign rewards + spotlight bonuses (mirrors profile).
  const rewardEarnings = approvedRows.reduce((sum, s) => sum + (s.reward || 0), 0);
  const spotlightEarnings = visible.reduce(
    (sum, s) => sum + (s.spotlighted ? s.spotlightBonus || 0 : 0),
    0
  );
  // Follow counts: followers = who follows this profile; following = who this
  // profile follows. Non-fatal — fall back to 0 if the table isn't there yet.
  let followers = 0;
  let following = 0;
  try {
    const [f1] = await db
      .select({ n: sql`count(*)` })
      .from(follows)
      .where(eq(follows.followingId, params.id));
    followers = Number(f1?.n || 0);
    const [f2] = await db
      .select({ n: sql`count(*)` })
      .from(follows)
      .where(eq(follows.followerId, params.id));
    following = Number(f2?.n || 0);
  } catch {
    followers = 0;
    following = 0;
  }

  const stats = {
    submitted: visible.length,
    approved: approvedRows.length,
    rejected,
    approvalRate: reviewed ? Math.round((approvedRows.length / reviewed) * 100) : 0,
    earnings: rewardEarnings + spotlightEarnings,
    followers,
    following,
  };

  // Public portfolio = approved clips only.
  return NextResponse.json({ profile, stats, clips: approvedRows.map(({ campaignId: _campaignId, campaignRecordId: _campaignRecordId, brandId: _brandId, visibility: _visibility, showContributions: _showContributions, ...submission }) => submission) });
}
