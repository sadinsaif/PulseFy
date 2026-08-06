export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { submissions, withdrawals } from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { withdrawalSchema } from "@/lib/validation";

const FEE_RATE = 0.05; // 5% processing fee, matching GIMI

/**
 * Compute a creator's balance in CENTS:
 *   earned  = sum of approved submission rewards (stored in whole dollars)
 *   drawn   = sum of all non-failed withdrawal amounts (stored in cents)
 *   available = earned - drawn
 */
async function getBalanceCents(userId) {
  const [er] = await db
    .select({ n: sql`coalesce(sum(${submissions.reward}), 0)` })
    .from(submissions)
    .where(and(eq(submissions.userId, userId), eq(submissions.status, "approved")));
  const earnedCents = Number(er?.n || 0) * 100;

  const [wr] = await db
    .select({ n: sql`coalesce(sum(${withdrawals.amount}), 0)` })
    .from(withdrawals)
    .where(and(eq(withdrawals.userId, userId), sql`${withdrawals.status} <> 'failed'`));
  const drawnCents = Number(wr?.n || 0);

  return { earnedCents, drawnCents, availableCents: earnedCents - drawnCents };
}

/**
 * GET /api/withdrawals
 * Returns the signed-in creator's balance + their withdrawal history.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
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

  return NextResponse.json(
    {
      ok: true,
      withdrawal: inserted[0],
      message: "Withdrawal requested — it's now processing.",
    },
    { status: 201 }
  );
}
