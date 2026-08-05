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

  let rows;
  if (mine) {
    rows = await db
      .select({
        id: campaigns.id,
        title: campaigns.title,
        brief: campaigns.brief,
        platform: campaigns.platform,
        reward: campaigns.reward,
        status: campaigns.status,
        createdAt: campaigns.createdAt,
        brandName: users.name,
        submissionCount: subCount,
      })
      .from(campaigns)
      .leftJoin(users, eq(campaigns.brandId, users.id))
      .where(eq(campaigns.brandId, session.user.id))
      .orderBy(desc(campaigns.createdAt));
  } else {
    rows = await db
      .select({
        id: campaigns.id,
        title: campaigns.title,
        brief: campaigns.brief,
        platform: campaigns.platform,
        reward: campaigns.reward,
        status: campaigns.status,
        createdAt: campaigns.createdAt,
        brandName: users.name,
        submissionCount: subCount,
      })
      .from(campaigns)
      .leftJoin(users, eq(campaigns.brandId, users.id))
      .where(eq(campaigns.status, "active"))
      .orderBy(desc(campaigns.createdAt));
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

  const { title, brief, platform, reward } = parsed.data;

  const inserted = await db
    .insert(campaigns)
    .values({
      brandId: session.user.id,
      title: title.trim(),
      brief: brief ? brief.trim() : null,
      platform,
      reward,
    })
    .returning();

  return NextResponse.json({ ok: true, campaign: inserted[0] }, { status: 201 });
}
