export const dynamic = "force-dynamic";
// Give the durable write + a bounded (6s) YouTube fetch comfortable headroom.
export const maxDuration = 20;

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { campaignParticipants, campaigns, submissions, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { submissionSchema } from "@/lib/validation";
import { isAdminEmail } from "@/lib/admin";
import { notifyAdmins, notifyUser } from "@/lib/notify";
import { fetchMetrics } from "@/lib/metrics";

function duplicateError(error) {
  return error?.code === "23505" || error?.cause?.code === "23505";
}

function requestError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

/**
 * POST /api/submit
 * Creators submit their published clip to a campaign (or legacy challenge).
 * A creator may update pending or rejected work, but an approved submission is
 * financially committed and cannot be reset to pending through this endpoint.
 */
export async function POST(req) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "You must be signed in to submit." }, { status: 401 });
  }

  const [currentUser] = await db.select({ role: users.role })
    .from(users).where(eq(users.id, session.user.id));
  if (currentUser?.role !== "creator") {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
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
  const creatorName = session.user.name || "A creator";
  const duplicateWhere = campaignId
    ? and(eq(submissions.userId, session.user.id), eq(submissions.campaignId, campaignId))
    : and(eq(submissions.userId, session.user.id), eq(submissions.challengeId, challengeId));

  const campaignAccess = async (tx) => {
    if (!campaignId) return { challengeId, brandId: null };

    // The campaign lock serializes submission acceptance with campaign financial
    // operations and makes the access/status decision authoritative at write time.
    const [campaign] = await tx.select().from(campaigns)
      .where(eq(campaigns.id, campaignId)).for("update");
    if (!campaign) throw requestError("Campaign not found.", 404);
    if (campaign.status !== "active") {
      throw requestError("This campaign is not accepting submissions right now.", 400);
    }
    if (campaign.endsAt && new Date(campaign.endsAt).getTime() <= Date.now()) {
      throw requestError("This campaign has ended and is no longer accepting submissions.", 400);
    }

    if (campaign.visibility === "private") {
      // Re-read the DB role and authorization after the campaign lock. A client
      // cannot retain access after its participant record is revoked.
      const [creator] = await tx.select({ role: users.role })
        .from(users).where(eq(users.id, session.user.id));
      const [participant] = await tx.select({ campaignId: campaignParticipants.campaignId })
        .from(campaignParticipants)
        .where(and(
          eq(campaignParticipants.campaignId, campaign.id),
          eq(campaignParticipants.creatorId, session.user.id),
          eq(campaignParticipants.status, "authorized")
        ))
        .limit(1)
        .for("update");
      if (creator?.role !== "creator" || !participant) {
        // Match the private campaign detail policy and avoid enumeration.
        throw requestError("Campaign not found.", 404);
      }
    }

    return { challengeId: campaign.title, brandId: campaign.brandId };
  };

  const writeSubmission = async (tx) => {
    // Keep the same row-lock order as review (submission before campaign) for
    // an existing row; campaign acceptance is always revalidated before writing.
    const [existing] = await tx.select().from(submissions).where(duplicateWhere).for("update");
    const campaign = await campaignAccess(tx);

    if (existing) {
      if (existing.status === "approved") {
        throw requestError(
          "Approved submissions cannot be resubmitted. Contact the campaign owner if a change is needed.",
          409
        );
      }
      await tx.update(submissions)
        .set({ platform, postUrl, caption: caption || null, status: "pending" })
        .where(eq(submissions.id, existing.id));
      return { submissionId: existing.id, updated: true, ...campaign };
    }

    const [inserted] = await tx.insert(submissions).values({
      challengeId: campaign.challengeId,
      campaignId,
      userId: session.user.id,
      platform,
      postUrl,
      caption: caption || null,
    }).returning({ id: submissions.id });
    return { submissionId: inserted?.id, updated: false, ...campaign };
  };

  let result;
  try {
    result = await db.transaction(writeSubmission);
  } catch (error) {
    if (error.status) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (!duplicateError(error)) throw error;

    // PostgreSQL aborts a transaction after a unique violation, so retry in a
    // fresh transaction to lock the winning row and apply the same guards.
    try {
      result = await db.transaction(async (tx) => {
        const updated = await writeSubmission(tx);
        if (!updated.updated) throw error;
        return updated;
      });
    } catch (retryError) {
      if (retryError.status) {
        return NextResponse.json({ error: retryError.message }, { status: retryError.status });
      }
      throw retryError;
    }
  }

  // Best-effort metrics are intentionally after the durable write; a failed
  // external fetch can never lose or alter the financial submission state.
  const metrics = await fetchMetrics(platform, postUrl);
  if (metrics && result.submissionId) {
    await db.update(submissions)
      .set({ views: metrics.views, engagement: metrics.engagement })
      .where(eq(submissions.id, result.submissionId));
  }

  await notifyReviewers(result.brandId, {
    type: "submission",
    message: result.updated
      ? `${creatorName} updated their submission for ${result.challengeId}.`
      : `${creatorName} submitted a ${platform} post to ${result.challengeId}.`,
  });

  return result.updated
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

  if (campaignId) {
    const [campaign] = await db.select({ id: campaigns.id, brandId: campaigns.brandId, visibility: campaigns.visibility })
      .from(campaigns).where(eq(campaigns.id, campaignId));
    if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

    if (campaign.visibility === "private") {
      const owns = campaign.brandId === session.user.id;
      const admin = isAdminEmail(session.user.email);
      const [participant] = owns || admin
        ? [null]
        : await db.select({ campaignId: campaignParticipants.campaignId })
          .from(campaignParticipants)
          .where(and(
            eq(campaignParticipants.campaignId, campaign.id),
            eq(campaignParticipants.creatorId, session.user.id),
            eq(campaignParticipants.status, "authorized")
          ))
          .limit(1);
      if (!owns && !admin && !participant) {
        return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
      }
    }
  }

  const where = campaignId
    ? and(eq(submissions.userId, session.user.id), eq(submissions.campaignId, campaignId))
    : and(eq(submissions.userId, session.user.id), eq(submissions.challengeId, challengeId));
  const [submission] = await db.select().from(submissions).where(where);

  return NextResponse.json({ submission: submission || null });
}
