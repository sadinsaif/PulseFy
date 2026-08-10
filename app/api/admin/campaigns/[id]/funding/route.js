export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { campaignFundingLedger, campaigns } from "@/db/schema";
import { getCampaignFundingTotals, fundingStatus } from "@/lib/campaign-funding";
import { campaignFundingSchema } from "@/lib/validation";
import { isAdminEmail } from "@/lib/admin";

function failure(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function isClosed(campaign) {
  return campaign.status === "ended" || Boolean(campaign.endsAt && new Date(campaign.endsAt) <= new Date());
}

/** Admin-only internal funding summary; never used by public campaign APIs. */
export async function GET(_req, { params }) {
  const session = await auth();
  if (!session?.user?.id || !isAdminEmail(session.user.email)) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  const [campaign] = await db.select({ id: campaigns.id, budget: campaigns.budget, status: campaigns.status, endsAt: campaigns.endsAt })
    .from(campaigns).where(eq(campaigns.id, params.id));
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  const totals = await getCampaignFundingTotals(db, campaign.id);
  return NextResponse.json({
    funding: { ...totals, budget: Number(campaign.budget), status: fundingStatus({ budget: campaign.budget, ...totals }) },
  });
}

/** Record verified manual funding. Brands and creators have no funding route. */
export async function POST(req, { params }) {
  const session = await auth();
  if (!session?.user?.id || !isAdminEmail(session.user.email)) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const parsed = campaignFundingSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid funding record" }, { status: 400 });
  const input = parsed.data;

  try {
    const funding = await db.transaction(async (tx) => {
      const [campaign] = await tx.select().from(campaigns).where(eq(campaigns.id, params.id)).for("update");
      if (!campaign) throw failure("Campaign not found", 404);
      if (isClosed(campaign)) throw failure("Closed campaigns cannot receive new funding.", 409);

      const totals = await getCampaignFundingTotals(tx, campaign.id);
      const amount = input.amount;
      if (totals.funded + amount > Number(campaign.budget)) {
        throw failure("Verified funding cannot exceed the campaign's declared budget.", 409);
      }

      const [entry] = await tx.insert(campaignFundingLedger).values({
        campaignId: campaign.id,
        actorId: session.user.id,
        action: "funding",
        amount,
        reference: input.reference,
        note: input.note || null,
      }).returning();
      const next = { funded: totals.funded + amount, reserved: totals.reserved, spent: totals.spent, available: totals.available + amount };
      return { entry, budget: Number(campaign.budget), ...next };
    });
    return NextResponse.json({ ok: true, funding: { ...funding, status: fundingStatus(funding) } }, { status: 201 });
  } catch (error) {
    if (error?.code === "23505" || error?.cause?.code === "23505") {
      return NextResponse.json({ error: "This verified funding reference has already been recorded." }, { status: 409 });
    }
    if (error.status) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
