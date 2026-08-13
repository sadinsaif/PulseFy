export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import {
  campaigns,
  users,
  submissions,
  brandWalletLedger,
  campaignFundingLedger,
} from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { campaignSchema } from "@/lib/validation";
import { isAdminEmail } from "@/lib/admin";
import { getBrandWalletTotals } from "@/lib/brand-wallet";

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
  const budgetSpent = campaigns.budgetSpent;

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
    brandVerified: users.isVerified,
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

  const [currentUser] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, session.user.id));
  const isBrand = currentUser?.role === "brand";
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
    idempotencyKey,
  } = parsed.data;

  // Turn the brand's chosen duration (in days) into a concrete end date for the
  // countdown. An empty/absent duration means the campaign is open-ended.
  const days = Number(durationDays);
  const endsAt =
    days >= 1 ? new Date(Date.now() + days * 24 * 60 * 60 * 1000) : null;

  const key = idempotencyKey && idempotencyKey.trim() ? idempotencyKey.trim() : null;
  const fundedLaunch = Number(budget) > 0;

  // The launch is transactional and server-authoritative (§7/§8/§9). We never
  // trust a client-supplied balance: the wallet is recomputed under a lock, the
  // budget is reserved atomically with the campaign insert, and idempotency is
  // guarded three ways (campaign key, partial-unique reserve row, unique funding
  // reference). A $0/unfunded campaign keeps the original behaviour — no wallet
  // check, no reserve — so nothing existing breaks.
  let created;
  try {
    created = await db.transaction(async (tx) => {
      // Lock the brand's account row to serialize its wallet operations, exactly
      // like POST /api/withdrawals. Concurrent launches then can't both pass the
      // balance check off a stale read.
      const [account] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, session.user.id))
        .for("update");
      if (!account) {
        const error = new Error("User not found");
        error.status = 404;
        throw error;
      }

      // Idempotency guard #1 — a repeated POST with the same key returns the
      // already-created campaign instead of creating (and reserving) a second.
      // Scoped to THIS brand: the key is client-supplied, so an unscoped match
      // could return (and leak) another brand's campaign (§19).
      if (key) {
        const [existing] = await tx
          .select()
          .from(campaigns)
          .where(
            and(
              eq(campaigns.idempotencyKey, key),
              eq(campaigns.brandId, session.user.id)
            )
          );
        if (existing) return { campaign: existing, replayed: true };
      }

      if (fundedLaunch) {
        const { available } = await getBrandWalletTotals(tx, session.user.id);
        if (available < Number(budget)) {
          const error = new Error(
            "Insufficient wallet balance to launch this campaign."
          );
          error.status = 402;
          error.payload = {
            error: error.message,
            required: Number(budget),
            available,
            shortfall: Number(budget) - available,
          };
          throw error;
        }
      }

      const [campaign] = await tx
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
          idempotencyKey: key,
        })
        .returning();

      if (fundedLaunch) {
        // Reserve the budget out of Available (§8). Idempotency guard #2: the
        // partial-unique index on (campaign_id) WHERE action='reserve' means a
        // campaign can reserve at most once, ever.
        await tx.insert(brandWalletLedger).values({
          brandId: session.user.id,
          campaignId: campaign.id,
          action: "reserve",
          amount: Number(budget),
          note: "Campaign launch budget reservation",
        });

        // Critical integration (§13): the review route pays creators only up to
        // getCampaignFundingTotals().available from campaign_funding_ledger. A
        // wallet-funded campaign must therefore carry a matching `funding` row or
        // creators could never be paid. reference is unique per campaign, so this
        // is idempotency guard #3. Wallet balances still derive purely from
        // brand_wallet_ledger + brand_topups, so this does not double-count.
        await tx.insert(campaignFundingLedger).values({
          campaignId: campaign.id,
          actorId: session.user.id,
          action: "funding",
          amount: Number(budget),
          reference: `wallet:${campaign.id}`,
          note: "Wallet-funded campaign launch",
        });
      }

      return { campaign, replayed: false };
    });
  } catch (error) {
    if (error.status === 402 && error.payload) {
      return NextResponse.json(error.payload, { status: 402 });
    }
    if (error.status) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    // A racing duplicate launch (same idempotency key or reserve row) trips a
    // unique constraint — treat it as the idempotent no-op it is.
    if (error?.code === "23505" || error?.cause?.code === "23505") {
      if (key) {
        const [existing] = await db
          .select()
          .from(campaigns)
          .where(
            and(
              eq(campaigns.idempotencyKey, key),
              eq(campaigns.brandId, session.user.id)
            )
          );
        if (existing) {
          let replayWallet = null;
          try {
            const totals = await getBrandWalletTotals(db, session.user.id);
            replayWallet = {
              available: totals.available,
              reserved: totals.reserved,
              total: totals.total,
            };
          } catch {
            replayWallet = null;
          }
          return NextResponse.json(
            { ok: true, campaign: existing, wallet: replayWallet },
            { status: 200 }
          );
        }
      }
      return NextResponse.json(
        { error: "This campaign was already launched." },
        { status: 409 }
      );
    }
    throw error;
  }

  // Return the freshly-derived wallet totals so the launch success screen shows a
  // server-authoritative balance (§5/§18), not stale client-side math. Non-fatal
  // if it fails — the client falls back to its own estimate when wallet is null.
  let wallet = null;
  try {
    const totals = await getBrandWalletTotals(db, session.user.id);
    wallet = {
      available: totals.available,
      reserved: totals.reserved,
      total: totals.total,
    };
  } catch {
    wallet = null;
  }

  return NextResponse.json(
    { ok: true, campaign: created.campaign, wallet },
    { status: created.replayed ? 200 : 201 }
  );
}
