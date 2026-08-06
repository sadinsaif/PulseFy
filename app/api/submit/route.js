export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { submissions, campaigns } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { submissionSchema } from "@/lib/validation";
import { notifyAdmins, notifyUser } from "@/lib/notify";
import { fetchMetrics } from "@/lib/metrics";

/**
 * POST /api/submit
 * Creators submit their published clip to a campaign (or legacy challenge).
 * If a campaignId is given, the submission is tied to that campaign and the
 * owning brand is notified. Auth required.
 */
export async function POST(req) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "You must be signed in to submit." }, { status: 401 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = submissionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid input" },
      { status: 400 }
    );
  }

  let { challengeId, campaignId, platform, postUrl, caption } = parsed.data;
  campaignId = campaignId || null;

  // If this targets a real campaign, validate it and use its title as the label.
  let brandId = null;
  if (campaignId) {
    const camp = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    if (!camp[0]) {
      return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    }
    if (camp[0].status !== "active") {
      return NextResponse.json(
        { error: "This campaign is not accepting submissions right now." },
        { status: 400 }
      );
    }
    challengeId = camp[0].title;
    brandId = camp[0].brandId;
  }

  const creatorName = session.user.name || "A creator";

  // Try to pull REAL metrics right away (YouTube only for now). null means we
  // couldn't fetch — we leave views/engagement untouched rather than fake them.
  const metrics = await fetchMetrics(platform, postUrl);

  // One submission per creator per campaign (or per legacy challenge) — resubmit
  // updates the existing row and puts it back in review.
  const dupeWhere = campaignId
    ? and(eq(submissions.userId, session.user.id), eq(submissions.campaignId, campaignId))
    : and(eq(submissions.userId, session.user.id), eq(submissions.challengeId, challengeId));

  const existing = await db.select().from(submissions).where(dupeWhere);

  if (existing[0]) {
    await db
      .update(submissions)
      .set({
        platform,
        postUrl,
        caption: caption || null,
        status: "pending",
        ...(metrics ? { views: metrics.views, engagement: metrics.engagement } : {}),
      })
      .where(eq(submissions.id, existing[0].id));
    await notifyReviewers(brandId, {
      type: "submission",
      message: `${creatorName} updated their submission for ${challengeId}.`,
    });
    return NextResponse.json({
      ok: true,
      updated: true,
      message: "Your submission was updated and is back in review.",
    });
  }

  await db.insert(submissions).values({
    challengeId,
    campaignId,
    userId: session.user.id,
    platform,
    postUrl,
    caption: caption || null,
    ...(metrics ? { views: metrics.views, engagement: metrics.engagement } : {}),
  });

  await notifyReviewers(brandId, {
    type: "submission",
    message: `${creatorName} submitted a ${platform} post to ${challengeId}.`,
  });

  return NextResponse.json(
    { ok: true, message: "Submission received — it's now in review." },
    { status: 201 }
  );
}

/** Notify the owning brand for campaign submissions; otherwise the admins. */
async function notifyReviewers(brandId, { type, message }) {
  if (brandId) {
    await notifyUser(brandId, { type, message, link: "/dashboard/submissions" });
  } else {
    await notifyAdmins({ type, message, link: "/dashboard/submissions" });
  }
}

/**
 * GET /api/submit?campaignId=... (or ?challengeId=...)
 * Returns the signed-in creator's own submission for that campaign/challenge.
 */
export async function GET(req) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const url = new URL(req.url).searchParams;
  const campaignId = url.get("campaignId") || "";
  const challengeId = url.get("challengeId") || "";
  if (!campaignId && !challengeId) {
    return NextResponse.json({ error: "Missing campaignId or challengeId" }, { status: 400 });
  }

  const where = campaignId
    ? and(eq(submissions.userId, session.user.id), eq(submissions.campaignId, campaignId))
    : and(eq(submissions.userId, session.user.id), eq(submissions.challengeId, challengeId));

  const rows = await db.select().from(submissions).where(where);

  return NextResponse.json({ submission: rows[0] || null });
}
