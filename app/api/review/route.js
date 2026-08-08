export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { submissions, users, campaigns } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { reviewSchema } from "@/lib/validation";
import { isAdminEmail } from "@/lib/admin";
import { notifyUser } from "@/lib/notify";

/**
 * GET /api/review
 * Returns every submission (newest first) joined with the creator's name/email
 * so the brand owner can review them. Auth required.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const admin = isAdminEmail(session.user.email);
  const isBrand = session.user.role === "brand";
  if (!admin && !isBrand) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  const cols = {
    id: submissions.id,
    challengeId: submissions.challengeId,
    campaignId: submissions.campaignId,
    platform: submissions.platform,
    postUrl: submissions.postUrl,
    caption: submissions.caption,
    status: submissions.status,
    reward: submissions.reward,
    views: submissions.views,
    engagement: submissions.engagement,
    spotlighted: submissions.spotlighted,
    spotlightBonus: submissions.spotlightBonus,
    createdAt: submissions.createdAt,
    creatorId: submissions.userId,
    creatorName: users.name,
    creatorEmail: users.email,
    // Campaign reward — shown as the "Offer" in the brand Applications view.
    campaignReward: sql`(select reward from campaigns where campaigns.id = ${submissions.campaignId})`,
    // Per-creator reputation stats for the brand Applications view. Additive —
    // ReviewBoard ignores fields it doesn't read.
    creatorFollowers: sql`(select count(*) from follows where follows.following_id = ${submissions.userId})`,
    creatorAvgViews: sql`(select coalesce(round(avg(views)),0) from submissions s2 where s2.user_id = ${submissions.userId})`,
    creatorEngagementRate: sql`(
      select case when coalesce(sum(views),0) > 0
        then round(sum(engagement)::numeric / sum(views)::numeric * 100, 1)
        else 0 end
      from submissions s3 where s3.user_id = ${submissions.userId}
    )`,
  };

  // Admin sees every submission; a brand sees only submissions to campaigns
  // they own (joined via campaigns.brand_id).
  const base = db
    .select(cols)
    .from(submissions)
    .leftJoin(users, eq(submissions.userId, users.id));

  const rows = admin
    ? await base.orderBy(desc(submissions.createdAt))
    : await base
        .innerJoin(campaigns, eq(submissions.campaignId, campaigns.id))
        .where(eq(campaigns.brandId, session.user.id))
        .orderBy(desc(submissions.createdAt));

  return NextResponse.json({ submissions: rows });
}

/**
 * POST /api/review
 * Approve or reject a submission. Auth required.
 * Body: { submissionId, status: "approved" | "rejected" | "pending" }
 */
export async function POST(req) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const admin = isAdminEmail(session.user.email);
  const isBrand = session.user.role === "brand";
  if (!admin && !isBrand) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid input" },
      { status: 400 }
    );
  }

  const { submissionId, status, reward, views, engagement, spotlighted, spotlightBonus } =
    parsed.data;

  const existing = await db
    .select()
    .from(submissions)
    .where(eq(submissions.id, submissionId));
  if (!existing[0]) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }

  // Block self-review: a user can never review/spotlight their own submission.
  if (existing[0].userId === session.user.id) {
    return NextResponse.json({ error: "You cannot review your own submission." }, { status: 403 });
  }

  // A brand may only review submissions to campaigns they own.
  if (!admin) {
    const campId = existing[0].campaignId;
    let owns = false;
    if (campId) {
      const camp = await db.select().from(campaigns).where(eq(campaigns.id, campId));
      owns = camp[0]?.brandId === session.user.id;
    }
    if (!owns) {
      return NextResponse.json({ error: "Not your campaign." }, { status: 403 });
    }
  }

  // On approval, set the reward (default keeps prior value). On reject, zero it.
  const patch = { status };
  if (status === "approved") {
    patch.reward = reward != null ? reward : existing[0].reward || 0;
  } else if (status === "rejected") {
    patch.reward = 0;
  }

  // Real metrics the admin verified — persist whenever they were supplied,
  // regardless of status, so views/engagement stay accurate. Rate is derived.
  if (views != null) patch.views = views;
  if (engagement != null) patch.engagement = engagement;

  // Spotlight — admin highlights a standout post and grants a flexible bonus.
  // Turning it on sets (or keeps) the bonus; turning it off clears the bonus so
  // it no longer counts toward earnings/balance. Track whether it just went on
  // (or the bonus changed) so we can celebrate it with the creator.
  let spotlightRewarded = false;
  if (spotlighted != null) {
    patch.spotlighted = spotlighted;
    if (spotlighted) {
      patch.spotlightBonus =
        spotlightBonus != null ? spotlightBonus : existing[0].spotlightBonus || 0;
      spotlightRewarded =
        !existing[0].spotlighted || patch.spotlightBonus !== (existing[0].spotlightBonus || 0);
    } else {
      patch.spotlightBonus = 0;
    }
  } else if (spotlightBonus != null && existing[0].spotlighted) {
    // Bonus edited on an already-spotlighted post.
    patch.spotlightBonus = spotlightBonus;
    spotlightRewarded = spotlightBonus !== (existing[0].spotlightBonus || 0);
  }

  await db
    .update(submissions)
    .set(patch)
    .where(eq(submissions.id, submissionId));

  // Tell the creator their post was reviewed — only when the status actually
  // changed, so editing a reward or toggling spotlight doesn't re-send it.
  if (
    (status === "approved" || status === "rejected") &&
    status !== existing[0].status
  ) {
    const verb =
      status === "approved"
        ? patch.reward > 0
          ? `approved ✅ — you earned $${patch.reward}`
          : "approved ✅"
        : "rejected";
    await notifyUser(existing[0].userId, {
      type: "review",
      message: `Your submission to ${existing[0].challengeId} was ${verb}.`,
      link: "/dashboard/profile",
    });
  }

  // Celebrate a fresh spotlight (or a bumped bonus) separately.
  if (spotlightRewarded && (patch.spotlightBonus || 0) > 0) {
    await notifyUser(existing[0].userId, {
      type: "review",
      message: `✦ Your post to ${existing[0].challengeId} was Spotlighted! You earned a $${patch.spotlightBonus} bonus.`,
      link: "/dashboard/profile",
    });
  }

  return NextResponse.json({
    ok: true,
    status,
    reward: patch.reward,
    spotlighted: patch.spotlighted,
    spotlightBonus: patch.spotlightBonus,
  });
}
