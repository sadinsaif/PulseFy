export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { campaigns, submissions, users } from "@/db/schema";
import { canViewCampaignContributions, participantCampaignIds } from "@/lib/campaign-access";

const MAX = 24;

export async function GET(req) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const campaignId = new URL(req.url).searchParams.get("campaignId");
  const filter = campaignId ? and(eq(submissions.spotlighted, true), eq(submissions.campaignId, campaignId)) : eq(submissions.spotlighted, true);
  const rows = await db.select({
    id: submissions.id, challengeId: submissions.challengeId, platform: submissions.platform, postUrl: submissions.postUrl,
    reward: submissions.reward, spotlightBonus: submissions.spotlightBonus, views: submissions.views, engagement: submissions.engagement,
    createdAt: submissions.createdAt, creatorId: submissions.userId, creatorName: users.name, creatorUsername: users.username,
    creatorImage: users.image, campaignId: campaigns.id, brandId: campaigns.brandId, visibility: campaigns.visibility,
    showContributions: campaigns.showContributions,
  }).from(submissions).leftJoin(users, eq(submissions.userId, users.id)).innerJoin(campaigns, eq(submissions.campaignId, campaigns.id))
    .where(filter).orderBy(desc(submissions.spotlightBonus), desc(submissions.createdAt)).limit(MAX);
  const participantIds = await participantCampaignIds(session.user.id, [...new Set(rows.map((row) => row.campaignId))]);
  const spotlights = rows.filter((row) => canViewCampaignContributions(row, session, participantIds))
    .map(({ campaignId: _campaignId, brandId: _brandId, visibility: _visibility, showContributions: _showContributions, ...row }) => row);
  return NextResponse.json({ spotlights });
}
