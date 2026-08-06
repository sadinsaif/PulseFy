export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { submissions, withdrawals, users, referralEarnings } from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { withdrawalSchema } from "@/lib/validation";
import { isAdminEmail } from "@/lib/admin";
import { notifyAdmins, notifyUser } from "@/lib/notify";

const FEE_RATE = 0.05; // 5% processing fee, matching GIMI

/**
 * Compute a creator's balance in CENTS:
 *   earned  = sum of approved submission rewards (whole dollars)
 *           + sum of spotlight bonuses on spotlighted posts (whole dollars)
 *           + sum of referral commissions (in cents, already)
 *   drawn   = sum of all non-failed withdrawal amounts (stored in cents)
 *   available = earned - drawn
 */
async function getBalanceCents(userId) {
  const [er] = await db
    .select({ n: sql`coalesce(sum(${submissions.reward}), 0)` })
    .from(submissions)
    .where(and(eq(submissions.userId, userId), eq(submissions.status, "approved")));

  // Spotlight bonuses count on their own (a standout post the admin highlighted),
  // independent of campaign approval.
  const [sr] = await db
    .select({ n: sql`coalesce(sum(${submissions.spotlightBonus}), 0)` })
    .from(submissions)
    .where(and(eq(submissions.userId, userId), eq(submissions.spotlighted, true)));

  // Referral earnings — 5% commission from referred users' paid withdrawals. These
  // are already in cents and always withdrawable (created only when funded).
  const [rr] = await db
    .select({ n: sql`coalesce(sum(${referralEarnings.amount}), 0)` })
    .from(referralEarnings)
    .where(eq(referralEarnings.referrerId, userId));

  const earnedCents = (Number(er?.n || 0) + Number(sr?.n || 0)) * 100 + Number(rr?.n || 0);

  const [wr] = await db
    .select({ n: sql`coalesce(sum(${withdrawals.amount}), 0)` })
    .from(withdrawals)
    .where(and(eq(withdrawals.userId, userId), sql`${withdrawals.status} <> 'failed'`));
  const drawnCents = Number(wr?.n || 0);

  return { earnedCents, drawnCents, availableCents: earnedCents - drawnCents };
}

/**
 * GET /api/withdrawals
 *   default   → the signed-in creator's balance + their own withdrawal history
 *   ?all=1    → (admin only) every withdrawal request with the creator's name/email
 */
export async function GET(req) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const all = new URL(req.url).searchParams.get("all") === "1";

  // Admin management view: list every request so payouts can be actioned.
  if (all) {
    if (!isAdminEmail(session.user.email)) {
      return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    }
    const rows = await db
      .select({
        id: withdrawals.id,
        amount: withdrawals.amount,
        fee: withdrawals.fee,
        net: withdrawals.net,
        method: withdrawals.method,
        coin: withdrawals.coin,
        network: withdrawals.network,
        destination: withdrawals.destination,
        status: withdrawals.status,
        createdAt: withdrawals.createdAt,
        creatorId: withdrawals.userId,
        creatorName: users.name,
        creatorEmail: users.email,
      })
      .from(withdrawals)
      .leftJoin(users, eq(withdrawals.userId, users.id))
      .orderBy(desc(withdrawals.createdAt));
    return NextResponse.json({ withdrawals: rows });
  }

  const { earnedCents, drawnCents, availableCents } = await getBalanceCents(session.user.id);

  const rows = await db
    .select()
    .from(withdrawals)
    .where(eq(withdrawals.userId, session.user.id))
    .orderBy(desc(withdrawals.createdAt));

  return NextResponse.json({
    balance: {
      earned: earnedCents / 100,
      withdrawn: drawnCents / 100,
      available: availableCents / 100,
    },
    withdrawals: rows,
  });
}

/**
 * POST /api/withdrawals
 * A creator requests a cash-out. Validates the amount against their available
 * balance, records a pending withdrawal with a 5% processing fee.
 */
export async function POST(req) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = withdrawalSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid input" },
      { status: 400 }
    );
  }

  const { method, amount, coin, network, destination } = parsed.data;
  const amountCents = Math.round(amount * 100);

  const { availableCents } = await getBalanceCents(session.user.id);
  if (amountCents > availableCents) {
    return NextResponse.json(
      {
        error: `Insufficient balance. You have $${(availableCents / 100).toFixed(
          2
        )} available.`,
      },
      { status: 400 }
    );
  }

  const feeCents = Math.round(amountCents * FEE_RATE);
  const netCents = amountCents - feeCents;

  const inserted = await db
    .insert(withdrawals)
    .values({
      userId: session.user.id,
      amount: amountCents,
      fee: feeCents,
      net: netCents,
      method,
      coin: method === "stablecoin" ? coin : null,
      network: method === "stablecoin" ? network : null,
      destination: destination.trim(),
      status: "pending",
    })
    .returning();

  // Alert admins so they can send the payment.
  const who = session.user.name || session.user.email || "A creator";
  const dest = destination.trim();
  const howLabel =
    method === "stablecoin"
      ? `${(coin || "usdc").toUpperCase()} on ${network} → ${dest}`
      : `bank/PayPal → ${dest}`;
  await notifyAdmins({
    type: "withdrawal",
    message: `${who} requested a $${amount.toFixed(2)} withdrawal (${howLabel}).`,
    link: "/dashboard/payouts",
  });

  return NextResponse.json(
    {
      ok: true,
      withdrawal: inserted[0],
      message: "Withdrawal requested — it's now processing.",
    },
    { status: 201 }
  );
}

/**
 * PATCH /api/withdrawals — admin marks a request paid or failed.
 * Body: { id, status: "paid" | "failed" }. Notifies the creator.
 */
export async function PATCH(req) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }
  if (!isAdminEmail(session.user.email)) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { id, status } = body || {};
  if (!id || !["paid", "failed", "pending"].includes(status)) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const existing = await db.select().from(withdrawals).where(eq(withdrawals.id, id));
  if (!existing[0]) {
    return NextResponse.json({ error: "Withdrawal not found" }, { status: 404 });
  }

  await db.update(withdrawals).set({ status }).where(eq(withdrawals.id, id));

  // Referral commission — when a withdrawal is marked PAID and the creator was
  // referred (users.referred_by is set), check if they're still in the 90-day
  // window. If yes, the referrer earns 5% of the net amount (in cents).
  if (status === "paid") {
    const [referee] = await db
      .select({ referredBy: users.referredBy, createdAt: users.createdAt })
      .from(users)
      .where(eq(users.id, existing[0].userId));

    if (referee?.referredBy) {
      const now = new Date();
      const accountAge = now - new Date(referee.createdAt);
      const ninetyDays = 90 * 24 * 60 * 60 * 1000;

      if (accountAge <= ninetyDays) {
        // Check if this withdrawal already earned a commission (prevents double-
        // counting if the admin toggles paid → pending → paid).
        const [duplicate] = await db
          .select()
          .from(referralEarnings)
          .where(eq(referralEarnings.withdrawalId, id));

        if (!duplicate) {
          const commissionCents = Math.round(existing[0].net * 0.05);
          await db.insert(referralEarnings).values({
            referrerId: referee.referredBy,
            refereeId: existing[0].userId,
            withdrawalId: id,
            amount: commissionCents,
          });
        }
      }
    }
  }

  // Tell the creator what happened.
  if (status === "paid" || status === "failed") {
    const amt = (existing[0].net / 100).toFixed(2);
    const msg =
      status === "paid"
        ? `Your withdrawal of $${amt} has been paid ✅`
        : `Your withdrawal of $${amt} could not be processed and was refunded to your balance.`;
    await notifyUser(existing[0].userId, {
      type: "review",
      message: msg,
      link: "/dashboard/payouts",
    });
  }

  return NextResponse.json({ ok: true, status });
}
