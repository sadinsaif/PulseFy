export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { submissions, users, campaigns } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
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
    createdAt: submissions.createdAt,
    creatorId: submissions.userId,
    creatorName: users.name,
    creatorEmail: users.email,
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

  const { submissionId, status, reward, views, engagement } = parsed.data;

  const existing = await db
    .select()
    .from(submissions)
    .where(eq(submissions.id, submissionId));
  if (!existing[0]) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
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

  await db
    .update(submissions)
    .set(patch)
    .where(eq(submissions.id, submissionId));

  // Tell the creator their post was reviewed (skip "pending" resets).
  if (status === "approved" || status === "rejected") {
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

  return NextResponse.json({ ok: true, status, reward: patch.reward });
}
