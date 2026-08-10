export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { campaignParticipants, campaigns, reviews, submissions, users } from "@/db/schema";
import { notifyUser } from "@/lib/notify";
import { trustReviewSchema } from "@/lib/validation";

function completed(campaign) {
  return campaign.status === "ended" || (campaign.endsAt && new Date(campaign.endsAt) <= new Date());
}
function duplicateError(error) {
  return error?.code === "23505" || error?.cause?.code === "23505";
}

export async function POST(req) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  let body; try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const parsed = trustReviewSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid review" }, { status: 400 });
  const d = parsed.data;
  if (d.revieweeId === session.user.id) return NextResponse.json({ error: "You cannot review yourself." }, { status: 400 });

  const [[reviewer], [reviewee], [campaign]] = await Promise.all([
    db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, session.user.id)),
    db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, d.revieweeId)),
    db.select({ id: campaigns.id, brandId: campaigns.brandId, visibility: campaigns.visibility, status: campaigns.status, endsAt: campaigns.endsAt }).from(campaigns).where(eq(campaigns.id, d.campaignId)),
  ]);
  if (!reviewer || !reviewee || !campaign) return NextResponse.json({ error: "Campaign or user not found." }, { status: 404 });
  if (!completed(campaign)) return NextResponse.json({ error: "Reviews are available after a campaign is completed." }, { status: 409 });

  // Derive both sides from the database relationship, never request roles.
  let eligible = false;
  if (reviewer.role === "brand" && campaign.brandId === reviewer.id && reviewee.role === "creator") {
    const [participation] = await db.select({ id: submissions.id }).from(submissions)
      .where(and(eq(submissions.campaignId, campaign.id), eq(submissions.userId, reviewee.id))).limit(1);
    eligible = Boolean(participation);
  } else if (reviewer.role === "creator" && reviewee.role === "brand" && campaign.brandId === reviewee.id) {
    const [participation] = await db.select({ id: submissions.id }).from(submissions)
      .where(and(eq(submissions.campaignId, campaign.id), eq(submissions.userId, reviewer.id))).limit(1);
    eligible = Boolean(participation);
  }
  // Private-campaign relationships remain private after revocation. A creator
  // must still hold active, server-owned authorization to create either side of
  // a review relationship for a private campaign.
  if (eligible && campaign.visibility === "private") {
    const creatorId = reviewer.role === "creator" ? reviewer.id : reviewee.id;
    const [authorization] = await db.select({ campaignId: campaignParticipants.campaignId })
      .from(campaignParticipants)
      .where(and(
        eq(campaignParticipants.campaignId, campaign.id),
        eq(campaignParticipants.creatorId, creatorId),
        eq(campaignParticipants.status, "authorized")
      ))
      .limit(1);
    eligible = Boolean(authorization);
  }
  if (!eligible) return NextResponse.json({ error: "You can only review your completed campaign partner." }, { status: 403 });
  const [existing] = await db.select({ id: reviews.id }).from(reviews)
    .where(and(eq(reviews.campaignId, campaign.id), eq(reviews.reviewerId, reviewer.id), eq(reviews.revieweeId, reviewee.id))).limit(1);
  if (existing) return NextResponse.json({ error: "You have already reviewed this campaign partner." }, { status: 409 });
  try {
    // Private-campaign reviews are retained only for internal moderation and
    // never begin life as public reputation data.
    const [review] = await db.insert(reviews).values({ campaignId: campaign.id, reviewerId: reviewer.id, revieweeId: reviewee.id, reviewerType: reviewer.role, revieweeType: reviewee.role, rating: d.rating, comment: d.comment, status: campaign.visibility === "private" ? "hidden" : "visible" }).returning({ id: reviews.id, createdAt: reviews.createdAt });
    await notifyUser(reviewee.id, { type: "trust_review", message: "You received a new PulseFy review.", link: "/dashboard/profile" });
    return NextResponse.json({ ok: true, review }, { status: 201 });
  } catch (error) {
    if (duplicateError(error)) return NextResponse.json({ error: "You have already reviewed this campaign partner." }, { status: 409 });
    throw error;
  }
}
