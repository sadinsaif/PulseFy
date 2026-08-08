export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { campaigns, users, submissions } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { campaignSchema } from "@/lib/validation";
import { isAdminEmail } from "@/lib/admin";

/**
 * GET /api/campaigns
 *   ?mine=1  → the signed-in brand's own campaigns (any status)
 *   default  → all active campaigns for creators to browse
 * Each row includes the brand name and a live submission count.
 */
export async function GET(req) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const mine = new URL(req.url).searchParams.get("mine") === "1";

  const subCount = sql`(select count(*) from ${submissions} where ${submissions.campaignId} = ${campaigns.id})`;

  // Dollars already paid out of a campaign's pool: approved-post rewards plus
  // spotlight bonuses. The card shows budget MINUS this, so the pool ticks down
  // as the brand approves posts (see budgetLeft in lib/campaign.js).
  const budgetSpent = sql`(
    (select coalesce(sum(${submissions.reward}), 0) from ${submissions}
       where ${submissions.campaignId} = ${campaigns.id} and ${submissions.status} = 'approved')
    + (select coalesce(sum(${submissions.spotlightBonus}), 0) from ${submissions}
       where ${submissions.campaignId} = ${campaigns.id} and ${submissions.spotlighted} = true)
  )`;

  // Columns returned for every card. endsAt drives the live countdown and, when
  // in the past, marks a campaign as effectively ended (End vs Live badge).
  const cols = {
    id: campaigns.id,
    title: campaigns.title,
    brief: campaigns.brief,
    platform: campaigns.platform,
    reward: campaigns.reward,
    budget: campaigns.budget,
    budgetSpent,
    spotlightReward: campaigns.spotlightReward,
    performanceMult: campaigns.performanceMult,
    endsAt: campaigns.endsAt,
    status: campaigns.status,
    createdAt: campaigns.createdAt,
    contentType: campaigns.contentType,
    visibility: campaigns.visibility,
    thumbnailUrl: campaigns.thumbnailUrl,
    brandName: users.name,
    submissionCount: subCount,
  };

  // A campaign is "live" when active and not past its end date; otherwise it's
  // treated as ended. Live cards sort first so finished ones sit below (GIMI).
  const liveFirst = sql`case when ${campaigns.status} = 'active' and (${campaigns.endsAt} is null or ${campaigns.endsAt} > now()) then 0 else 1 end`;

  // Brand-only aggregates for the campaigns table (only selected in ?mine=1).
  // pendingCount   = submissions awaiting the brand's decision (Applications).
  // approvedCount  = approved posts (Approved Content).
  // creatorsSelected = distinct creators with at least one approved post.
  // totalViews     = Σ views across this campaign's submissions.
  const pendingCount = sql`(select count(*) from ${submissions} where ${submissions.campaignId} = ${campaigns.id} and ${submissions.status} = 'pending')`;
  const approvedCount = sql`(select count(*) from ${submissions} where ${submissions.campaignId} = ${campaigns.id} and ${submissions.status} = 'approved')`;
  const creatorsSelected = sql`(select count(distinct ${submissions.userId}) from ${submissions} where ${submissions.campaignId} = ${campaigns.id} and ${submissions.status} = 'approved')`;
  const totalViews = sql`(select coalesce(sum(${submissions.views}), 0) from ${submissions} where ${submissions.campaignId} = ${campaigns.id})`;

  let rows;
  if (mine) {
    rows = await db
      .select({
        ...cols,
        pendingCount,
        approvedCount,
        creatorsSelected,
        totalViews,
      })
      .from(campaigns)
      .leftJoin(users, eq(campaigns.brandId, users.id))
      .where(eq(campaigns.brandId, session.user.id))
      .orderBy(desc(campaigns.createdAt));
  } else {
    rows = await db
      .select(cols)
      .from(campaigns)
      .leftJoin(users, eq(campaigns.brandId, users.id))
      .where(sql`${campaigns.status} <> 'paused' and ${campaigns.visibility} is distinct from 'private'`)
      .orderBy(liveFirst, desc(campaigns.createdAt));
  }

  return NextResponse.json({ campaigns: rows });
}

/**
 * POST /api/campaigns — a brand creates a campaign. Auth + brand role required
 * (admins may also create). Body: { title, brief, platform, reward }.
 */
export async function POST(req) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const isBrand = session.user.role === "brand";
  if (!isBrand && !isAdminEmail(session.user.email)) {
    return NextResponse.json(
      { error: "Only brand accounts can create campaigns." },
      { status: 403 }
    );
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

  const {
    title,
    brief,
    platform,
    reward,
    budget,
    spotlightReward,
    performanceMult,
    durationDays,
    submitType,
    requirements,
    contentType,
    assetsUrl,
    visibility,
    showContributions,
    thumbnailUrl,
    bannerUrl,
  } = parsed.data;

  // Turn the brand's chosen duration (in days) into a concrete end date for the
  // countdown. An empty/absent duration means the campaign is open-ended.
  const days = Number(durationDays);
  const endsAt =
    days >= 1 ? new Date(Date.now() + days * 24 * 60 * 60 * 1000) : null;

  const inserted = await db
    .insert(campaigns)
    .values({
      brandId: session.user.id,
      title: title.trim(),
      brief: brief ? brief.trim() : null,
      platform,
      reward,
      budget,
      spotlightReward,
      performanceMult,
      endsAt,
      submitType,
      requirements: requirements ? requirements.trim() : null,
      contentType,
      assetsUrl: assetsUrl || null,
      visibility,
      showContributions,
      thumbnailUrl: thumbnailUrl || null,
      bannerUrl: bannerUrl || null,
    })
    .returning();

  return NextResponse.json({ ok: true, campaign: inserted[0] }, { status: 201 });
}
