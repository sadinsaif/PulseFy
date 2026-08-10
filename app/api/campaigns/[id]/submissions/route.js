export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { campaignParticipants, submissions, users, campaigns, reviews } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { isAdminEmail } from "@/lib/admin";

/**
 * GET /api/campaigns/[id]/submissions
 * Every post creators submitted to this campaign, joined with the creator's
 * name/username/avatar. RESTRICTED: only an admin or the owning brand may see
 * the full list — regular creators get a 403 and therefore only ever see the
 * public Spotlighted section. Each row carries the creator's earnings for this
 * campaign = approval reward + spotlight bonus.
 */
export async function GET(_req, { params }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  // Need the campaign owner to authorize a brand viewer.
  const campRows = await db
    .select({ id: campaigns.id, brandId: campaigns.brandId, visibility: campaigns.visibility, status: campaigns.status, endsAt: campaigns.endsAt })
    .from(campaigns)
    .where(eq(campaigns.id, params.id));
  const camp = campRows[0];
  if (!camp) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  // Only the owning brand or an admin may view every submission. For private
  // campaigns, hide existence from viewers without active campaign access.
  const admin = isAdminEmail(session.user.email);
  const owns = camp.brandId === session.user.id;
  if (!admin && !owns) {
    if (camp.visibility === "private") {
      const [participant] = await db.select({ campaignId: campaignParticipants.campaignId })
        .from(campaignParticipants)
        .where(and(
          eq(campaignParticipants.campaignId, camp.id),
          eq(campaignParticipants.creatorId, session.user.id),
          eq(campaignParticipants.status, "authorized")
        ))
        .limit(1);
      if (!participant) {
        return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
      }
    }
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  let rows = [];
  try {
    rows = await db
      .select({
        id: submissions.id,
        challengeId: submissions.challengeId,
        platform: submissions.platform,
        postUrl: submissions.postUrl,
        status: submissions.status,
        reward: submissions.reward,
        spotlightBonus: submissions.spotlightBonus,
        spotlighted: submissions.spotlighted,
        views: submissions.views,
        engagement: submissions.engagement,
        createdAt: submissions.createdAt,
        creatorId: submissions.userId,
        creatorRole: users.role,
        creatorName: users.name,
        creatorUsername: users.username,
        creatorImage: users.image,
      })
      .from(submissions)
      .leftJoin(users, eq(submissions.userId, users.id))
      .where(eq(submissions.campaignId, params.id))
      .orderBy(desc(submissions.createdAt));
  } catch {
    rows = [];
  }

  // Review eligibility is computed here for the brand UI, but the trust-review
  // endpoint independently verifies all of these conditions before writing.
  const [viewer] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, session.user.id));
  const isCompleted = camp.status === "ended" || Boolean(camp.endsAt && new Date(camp.endsAt) <= new Date());
  const canReviewCreators = viewer?.role === "brand" && owns && isCompleted;
  let reviewedCreatorIds = new Set();
  if (canReviewCreators) {
    const existingReviews = await db
      .select({ revieweeId: reviews.revieweeId })
      .from(reviews)
      .where(and(eq(reviews.campaignId, params.id), eq(reviews.reviewerId, session.user.id)));
    reviewedCreatorIds = new Set(existingReviews.map((review) => review.revieweeId));
  }

  return NextResponse.json({
    submissions: rows.map(({ creatorRole, ...submission }) => ({
      ...submission,
      canReview: canReviewCreators && creatorRole === "creator" && Boolean(submission.creatorId) && !reviewedCreatorIds.has(submission.creatorId),
    })),
  });
}
