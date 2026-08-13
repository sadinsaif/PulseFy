export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { campaignParticipants, campaigns, users, submissions, brandWalletLedger } from "@/db/schema";
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
 *
 * Wallet-funded campaigns carry two extra invariants (§9/§14):
 *   - Ending a campaign that reserved budget releases its UNUSED budget
 *     (budget − budget_spent) back to the brand's Available balance, once.
 *   - A campaign that has already released its budget cannot be re-opened
 *     (active/paused) — that would let its remaining budget be spent after it
 *     was returned to the wallet (double-spend).
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

  const nextStatus = parsed.data.status;

  try {
    await db.transaction(async (tx) => {
      // Lock the campaign row for the whole status decision.
      const [current] = await tx
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, params.id))
        .for("update");
      if (!current) {
        const error = new Error("Campaign not found");
        error.status = 404;
        throw error;
      }

      // Does this campaign participate in the wallet (has a reserve row)?
      const [reserveRow] = await tx
        .select({ id: brandWalletLedger.id })
        .from(brandWalletLedger)
        .where(
          and(
            eq(brandWalletLedger.campaignId, current.id),
            eq(brandWalletLedger.action, "reserve")
          )
        );
      const [releaseRow] = await tx
        .select({ id: brandWalletLedger.id })
        .from(brandWalletLedger)
        .where(
          and(
            eq(brandWalletLedger.campaignId, current.id),
            eq(brandWalletLedger.action, "release")
          )
        );

      // Reopen guard: once released, a wallet campaign stays ended.
      if (releaseRow && nextStatus !== "ended") {
        const error = new Error(
          "This campaign's budget was already released to your wallet and cannot be re-opened."
        );
        error.status = 409;
        throw error;
      }

      await tx
        .update(campaigns)
        .set({ status: nextStatus })
        .where(eq(campaigns.id, current.id));

      // Release unused budget when a wallet-funded campaign ends (§14). Only
      // budget − budget_spent, only if positive, only once (partial-unique index
      // on action='release' is the DB backstop against a double release).
      if (nextStatus === "ended" && reserveRow && !releaseRow) {
        const unused = Number(current.budget) - Number(current.budgetSpent || 0);
        if (unused > 0) {
          await tx.insert(brandWalletLedger).values({
            brandId: current.brandId,
            campaignId: current.id,
            action: "release",
            amount: unused,
            note: "Unused budget released on campaign end",
          });
        }
      }
    });
  } catch (error) {
    // A racing double-end trips the partial-unique release index — the release
    // already happened, so the end itself is effectively done.
    if (error?.code === "23505" || error?.cause?.code === "23505") {
      return NextResponse.json({ ok: true, status: nextStatus });
    }
    if (error.status) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }

  return NextResponse.json({ ok: true, status: nextStatus });
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
  // This includes budget=0: a non-reserved campaign with budget_spent>0 would
  // otherwise slip past this guard and trip the budget_spent<=budget DB CHECK as
  // an opaque 500 instead of this clean 400.
  const spent = Number(campaign.budgetSpent || 0);
  if (Number(d.budget) < spent) {
    return NextResponse.json(
      { error: `Budget can't be lower than the $${spent.toLocaleString()} already spent.` },
      { status: 400 }
    );
  }

  // Wallet-funded campaigns lock their budget after launch: the reserved amount
  // must stay exactly equal to the reserve row, or Available/Reserved would drift
  // from the ledger. Changing the budget would need a reserve/release delta
  // reconciliation, which is a documented future extension — for now, reject the
  // change with a clear message. All other edits are allowed. (§8 invariant.)
  const [reserveRow] = await db
    .select({ amount: brandWalletLedger.amount })
    .from(brandWalletLedger)
    .where(
      and(
        eq(brandWalletLedger.campaignId, campaign.id),
        eq(brandWalletLedger.action, "reserve")
      )
    );
  if (reserveRow && Number(d.budget) !== Number(campaign.budget)) {
    return NextResponse.json(
      {
        error:
          "This campaign's budget is reserved from your wallet and can't be changed after launch. End the campaign to release unused funds, then launch a new one.",
      },
      { status: 409 }
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
