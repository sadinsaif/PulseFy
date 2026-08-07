export const dynamic = "force-dynamic";
// Give the durable write + a bounded (6s) YouTube fetch comfortable headroom.
export const maxDuration = 20;

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
    // An active campaign past its end date is effectively ended — reject it so
    // the server agrees with the client's Live/End gate (see lib/campaign.js).
    if (camp[0].endsAt && new Date(camp[0].endsAt).getTime() <= Date.now()) {
      return NextResponse.json(
        { error: "This campaign has ended and is no longer accepting submissions." },
        { status: 400 }
      );
    }
    challengeId = camp[0].title;
    brandId = camp[0].brandId;
  }

  const creatorName = session.user.name || "A creator";

  // One submission per creator per campaign (or per legacy challenge) — resubmit
  // updates the existing row and puts it back in review.
  const dupeWhere = campaignId
    ? and(eq(submissions.userId, session.user.id), eq(submissions.campaignId, campaignId))
    : and(eq(submissions.userId, session.user.id), eq(submissions.challengeId, challengeId));

  const existing = await db.select().from(submissions).where(dupeWhere);

  // Write the submission DURABLY first — the metric fetch (network call) must
  // never gate or lose the write. We patch real metrics in afterwards.
  let submissionId;
  let updated = false;
  if (existing[0]) {
    submissionId = existing[0].id;
    updated = true;
    await db
      .update(submissions)
      .set({ platform, postUrl, caption: caption || null, status: "pending" })
      .where(eq(submissions.id, submissionId));
  } else {
    const inserted = await db
      .insert(submissions)
      .values({
        challengeId,
        campaignId,
        userId: session.user.id,
        platform,
        postUrl,
        caption: caption || null,
      })
      .returning({ id: submissions.id });
    submissionId = inserted[0]?.id;
  }

  // Best-effort real metrics (YouTube only for now). Timed out / non-YouTube /
  // failed all return null — we then leave views/engagement untouched (never
  // fake them). This runs AFTER the durable write, so it can't lose a submission.
  const metrics = await fetchMetrics(platform, postUrl);
  if (metrics && submissionId) {
    await db
      .update(submissions)
      .set({ views: metrics.views, engagement: metrics.engagement })
      .where(eq(submissions.id, submissionId));
  }

  await notifyReviewers(brandId, {
    type: "submission",
    message: updated
      ? `${creatorName} updated their submission for ${challengeId}.`
      : `${creatorName} submitted a ${platform} post to ${challengeId}.`,
  });

  return updated
    ? NextResponse.json({
        ok: true,
        updated: true,
        message: "Your submission was updated and is back in review.",
      })
    : NextResponse.json(
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
