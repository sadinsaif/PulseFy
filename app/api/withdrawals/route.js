export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { withdrawals, users, referralEarnings } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { withdrawalSchema } from "@/lib/validation";
import { isAdminEmail } from "@/lib/admin";
import { notifyAdmins, notifyUser } from "@/lib/notify";
import { getCreatorBalanceCents } from "@/lib/creator-balance";

const FEE_RATE = 0.05; // 5% processing fee, matching GIMI

/**
 * Compute a creator's balance in CENTS:
 *   earned  = sum of approved submission rewards with a matching net verified
 *             campaign-ledger commitment (whole dollars)
 *           + matching spotlight bonuses (whole dollars)
 *           + sum of referral commissions (in cents, already)
 *   drawn   = sum of all non-failed withdrawal amounts (stored in cents)
 *   available = earned - drawn
 */


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

  const { earnedCents, drawnCents, availableCents } = await getCreatorBalanceCents(db, session.user.id);

  const rows = await db
    .select()
    .from(withdrawals)
    .where(eq(withdrawals.userId, session.user.id))
    .orderBy(desc(withdrawals.createdAt));

  // The auto-provisioned embedded wallet (0x, USDC-on-Base) prefills the
  // withdrawal form. Convenience only — withdrawalSchema + admin settlement
  // remain the authority over what's actually paid.
  const [me] = await db
    .select({ walletAddress: users.walletAddress })
    .from(users)
    .where(eq(users.id, session.user.id));

  return NextResponse.json({
    balance: {
      earned: earnedCents / 100,
      withdrawn: drawnCents / 100,
      available: availableCents / 100,
    },
    walletAddress: me?.walletAddress || null,
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

  const parsed = withdrawalSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid input" },
      { status: 400 }
    );
  }

  const { method, amount, coin, network, destination } = parsed.data;
  const amountCents = Math.round(amount * 100);

  const feeCents = Math.round(amountCents * FEE_RATE);
  const netCents = amountCents - feeCents;
  let inserted;
  try {
    inserted = await db.transaction(async (tx) => {
      const [account] = await tx.select({ id: users.id }).from(users).where(eq(users.id, session.user.id)).for("update");
      if (!account) { const error = new Error("User not found"); error.status = 404; throw error; }
      const { availableCents } = await getCreatorBalanceCents(tx, session.user.id);
      if (amountCents > availableCents) {
        const error = new Error(`Insufficient balance. You have $${(availableCents / 100).toFixed(2)} available.`);
        error.status = 409;
        throw error;
      }
      return tx.insert(withdrawals).values({
        userId: session.user.id, amount: amountCents, fee: feeCents, net: netCents, method,
        coin: method === "stablecoin" ? coin : null, network: method === "stablecoin" ? network : null,
        destination: destination.trim(), status: "pending",
      }).returning();
    });
  } catch (error) {
    if (error.status) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }

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
  if (!id || typeof id !== "string" || !["paid", "failed"].includes(status)) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  let result;
  try {
    result = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(withdrawals)
        .where(eq(withdrawals.id, id)).for("update");
      if (!current) { const error = new Error("Withdrawal not found"); error.status = 404; throw error; }

      // Lock the account whenever a payout's balance treatment is decided. This
      // shares the lock order used by POST /api/withdrawals for serial safety.
      const [creator] = await tx.select({ id: users.id, referredBy: users.referredBy, createdAt: users.createdAt })
        .from(users).where(eq(users.id, current.userId)).for("update");
      if (!creator) { const error = new Error("Creator not found"); error.status = 404; throw error; }

      if (current.status === status) return { current, changed: false };
      if (current.status !== "pending") {
        const error = new Error(`A ${current.status} withdrawal is final and cannot be changed.`);
        error.status = 409;
        throw error;
      }

      await tx.update(withdrawals).set({ status }).where(eq(withdrawals.id, current.id));

      // A commission is created only for the one legal pending -> paid
      // transition, from persisted withdrawal values, in this same transaction.
      if (status === "paid" && creator.referredBy) {
        const accountAge = new Date() - new Date(creator.createdAt);
        const ninetyDays = 90 * 24 * 60 * 60 * 1000;
        if (accountAge <= ninetyDays) {
          const [duplicate] = await tx.select({ id: referralEarnings.id })
            .from(referralEarnings).where(eq(referralEarnings.withdrawalId, current.id));
          if (!duplicate) {
            await tx.insert(referralEarnings).values({
              referrerId: creator.referredBy,
              refereeId: current.userId,
              withdrawalId: current.id,
              amount: Math.round(current.net * 0.05),
            });
          }
        }
      }
      return { current, changed: true };
    });
  } catch (error) {
    if (error.status) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error?.code === "23505" || error?.cause?.code === "23505") {
      return NextResponse.json({ error: "Referral commission was already recorded for this withdrawal." }, { status: 409 });
    }
    throw error;
  }

  // Do not emit a payout notification for a harmless idempotent retry.
  if (result.changed) {
    const amt = (result.current.net / 100).toFixed(2);
    const message = status === "paid"
      ? `Your withdrawal of $${amt} has been paid ✅`
      : `Your withdrawal of $${amt} could not be processed and was refunded to your balance.`;
    await notifyUser(result.current.userId, { type: "review", message, link: "/dashboard/payouts" });
  }

  return NextResponse.json({ ok: true, status });
}
