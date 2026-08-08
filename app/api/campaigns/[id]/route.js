export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { campaigns, users, submissions } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { campaignStatusSchema } from "@/lib/validation";
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
      budgetSpent: sql`(
        (select coalesce(sum(${submissions.reward}), 0) from ${submissions}
           where ${submissions.campaignId} = ${campaigns.id} and ${submissions.status} = 'approved')
        + (select coalesce(sum(${submissions.spotlightBonus}), 0) from ${submissions}
           where ${submissions.campaignId} = ${campaigns.id} and ${submissions.spotlighted} = true)
      )`,
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
    })
    .from(campaigns)
    .leftJoin(users, eq(campaigns.brandId, users.id))
    .where(eq(campaigns.id, params.id));

  if (!rows[0]) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  return NextResponse.json({ campaign: rows[0] });
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
