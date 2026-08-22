export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { savedCampaigns, campaigns, campaignParticipants } from "@/db/schema";
import { isAdminEmail } from "@/lib/admin";

/**
 * Saved campaigns — a creator's private campaign bookmarks.
 *   GET    → { ids: [campaignId, …] } the caller's saved campaign ids
 *   POST   { campaignId } → save   (idempotent; a duplicate save is a no-op)
 *   DELETE { campaignId } → unsave
 * Every route requires sign-in and only ever touches the caller's own rows.
 * Non-financial: never read by any payout, ledger, or balance math.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const rows = await db
    .select({ campaignId: savedCampaigns.campaignId })
    .from(savedCampaigns)
    .where(eq(savedCampaigns.userId, session.user.id));
  return NextResponse.json({ ids: rows.map((r) => r.campaignId) });
}

// Shared body parse for POST/DELETE: pull a non-empty campaignId or an error.
async function readCampaignId(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return { error: "Invalid request", status: 400 };
  }
  const campaignId = typeof body?.campaignId === "string" ? body.campaignId.trim() : "";
  if (!campaignId) return { error: "Missing campaign", status: 400 };
  return { campaignId };
}

export async function POST(req) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const parsed = await readCampaignId(req);
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  // The campaign must exist AND be visible to this caller. A private campaign is
  // saveable only by its owner, an admin, or an authorized participant — mirroring
  // GET /api/campaigns/[id] so Save can't disclose a private campaign whose detail
  // page 404s. A deleted campaign is treated as non-existent.
  const [c] = await db
    .select({
      id: campaigns.id,
      brandId: campaigns.brandId,
      visibility: campaigns.visibility,
      deletedAt: campaigns.deletedAt,
    })
    .from(campaigns)
    .where(eq(campaigns.id, parsed.campaignId));
  if (!c || c.deletedAt) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  if (c.visibility === "private") {
    const owns = c.brandId === session.user.id;
    const admin = isAdminEmail(session.user.email);
    const [participation] =
      owns || admin
        ? [null]
        : await db
            .select({ campaignId: campaignParticipants.campaignId })
            .from(campaignParticipants)
            .where(
              and(
                eq(campaignParticipants.campaignId, c.id),
                eq(campaignParticipants.creatorId, session.user.id),
                eq(campaignParticipants.status, "authorized")
              )
            )
            .limit(1);
    if (!owns && !admin && !participation) {
      // Do not reveal that a private campaign exists to an unauthorized user.
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
  }
  // Composite PK (user_id, campaign_id) → a repeated save is a harmless no-op.
  await db
    .insert(savedCampaigns)
    .values({ userId: session.user.id, campaignId: parsed.campaignId })
    .onConflictDoNothing();
  return NextResponse.json({ ok: true, saved: true }, { status: 201 });
}

export async function DELETE(req) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const parsed = await readCampaignId(req);
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  await db
    .delete(savedCampaigns)
    .where(and(eq(savedCampaigns.userId, session.user.id), eq(savedCampaigns.campaignId, parsed.campaignId)));
  return NextResponse.json({ ok: true, saved: false });
}
