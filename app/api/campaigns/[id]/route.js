export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { campaignParticipants, campaigns, users, submissions } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { campaignStatusSchema, campaignSchema } from "@/lib/validation";
import { isAdminEmail } from "@/lib/admin";

/**
 * GET /api/campaigns/[id] — public campaign detail (brand name included).
 */
export async function GET(_req, { params }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const rows = await db
    .select({
      id: campaigns.id,
      brandId: campaigns.brandId,
      title: campaigns.title,
      brief: campaigns.brief,
      platform: campaigns.platform,
      reward: campaigns.reward,
      budget: campaigns.budget,
      budgetSpent: campaigns.budgetSpent,
      spotlightReward: campaigns.spotlightReward,
      performanceMult: campaigns.performanceMult,
      endsAt: campaigns.endsAt,
      status: campaigns.status,
      createdAt: campaigns.createdAt,
      submitType: campaigns.submitType,
      requirements: campaigns.requirements,
      contentType: campaigns.contentType,
      assetsUrl: campaigns.assetsUrl,
      visibility: campaigns.visibility,
      showContributions: campaigns.showContributions,
      thumbnailUrl: campaigns.thumbnailUrl,
      bannerUrl: campaigns.bannerUrl,
      brandName: users.name,
      brandVerified: users.isVerified,
    })
    .from(campaigns)
    .leftJoin(users, eq(campaigns.brandId, users.id))
    .where(eq(campaigns.id, params.id));

  const campaign = rows[0];
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  if (campaign.visibility === "private") {
    const owns = campaign.brandId === session.user.id;
    const admin = isAdminEmail(session.user.email);
    const [participation] = owns || admin
      ? [null]
      : await db.select({ campaignId: campaignParticipants.campaignId }).from(campaignParticipants)
        .where(and(eq(campaignParticipants.campaignId, campaign.id), eq(campaignParticipants.creatorId, session.user.id), eq(campaignParticipants.status, "authorized")))
        .limit(1);
    if (!owns && !admin && !participation) {
      // Do not reveal that a private campaign exists to an unauthorized user.
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
  }

  return NextResponse.json({ campaign });
}

/**
 * PATCH /api/campaigns/[id] — change status (active/paused/ended).
 * Only the owning brand (or an admin) may do this.
 */
export async function PATCH(req, { params }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const rows = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, params.id));
  const campaign = rows[0];
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const owns = campaign.brandId === session.user.id;
  if (!owns && !isAdminEmail(session.user.email)) {
    return NextResponse.json({ error: "Not your campaign." }, { status: 403 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = campaignStatusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  await db
    .update(campaigns)
    .set({ status: parsed.data.status })
    .where(eq(campaigns.id, params.id));

  return NextResponse.json({ ok: true, status: parsed.data.status });
}

/**
 * PUT /api/campaigns/[id] — full edit of a campaign's content by the owning
 * brand (or an admin). Validates the whole payload with campaignSchema (so
 * platform/contentType normalize to the stored CSV exactly like create) and
 * updates only the editable columns. brandId, budgetSpent, status and
 * createdAt are never taken from the body — a brand can only edit its own
 * campaign, enforced server-side.
 */
export async function PUT(req, { params }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const rows = await db.select().from(campaigns).where(eq(campaigns.id, params.id));
  const campaign = rows[0];
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const owns = campaign.brandId === session.user.id;
  if (!owns && !isAdminEmail(session.user.email)) {
    return NextResponse.json({ error: "Not your campaign." }, { status: 403 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = campaignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid input" },
      { status: 400 }
    );
  }

  const d = parsed.data;

  // A brand can't drop the budget below what the pool has already paid out.
  const spent = Number(campaign.budgetSpent || 0);
  if (Number(d.budget) > 0 && Number(d.budget) < spent) {
    return NextResponse.json(
      { error: `Budget can't be lower than the $${spent.toLocaleString()} already spent.` },
      { status: 400 }
    );
  }

  // Editing the duration recomputes the end date from now. A blank duration on
  // EDIT means "leave the end date unchanged" rather than "open-ended" —
  // otherwise a brand fixing an unrelated field on a campaign whose endsAt has
  // already passed (the form can't reconstruct a positive forward duration, so
  // it blanks the field) would silently clear endsAt and relaunch it open-ended.
  const days = Number(d.durationDays);
  const durationBlank = d.durationDays === "" || d.durationDays == null;
  const endsAt = durationBlank
    ? campaign.endsAt
    : days >= 1
      ? new Date(Date.now() + days * 24 * 60 * 60 * 1000)
      : null;

  await db
    .update(campaigns)
    .set({
      title: d.title.trim(),
      brief: d.brief ? d.brief.trim() : null,
      platform: d.platform,
      reward: d.reward,
      budget: d.budget,
      spotlightReward: d.spotlightReward,
      performanceMult: d.performanceMult,
      endsAt,
      submitType: d.submitType,
      requirements: d.requirements ? d.requirements.trim() : null,
      contentType: d.contentType,
      assetsUrl: d.assetsUrl || null,
      visibility: d.visibility,
      showContributions: d.showContributions,
      thumbnailUrl: d.thumbnailUrl || null,
      bannerUrl: d.bannerUrl || null,
    })
    .where(eq(campaigns.id, params.id));

  return NextResponse.json({ ok: true });
}
