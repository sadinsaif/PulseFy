export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { tokenClaims, tokenWallets, users } from "@/db/schema";
import { claimSchema } from "@/lib/validation";
import { isAdminEmail } from "@/lib/admin";
import { notifyAdmins, notifyUser } from "@/lib/notify";
import { getTokenRewardTotals } from "@/lib/staking";
import {
  parseTokens,
  formatTokens,
  formatTokensPretty,
  isTokenConfigured,
  TOKEN_SYMBOL,
} from "@/lib/solana";

// token_claims.amount is a BigInt column — JSON can't serialize BigInt, so every
// response converts amounts to strings (raw base units) plus a display string.
function serializeClaim(row, extra = {}) {
  return {
    id: row.id,
    amountBase: row.amount.toString(),
    amount: formatTokens(row.amount),
    amountDisplay: formatTokensPretty(row.amount),
    destination: row.destination,
    status: row.status,
    txSignature: row.txSignature || null,
    note: row.note || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...extra,
  };
}

/**
 * GET /api/token/claim
 *   default → the holder's derived available rewards + their own claim history
 *   ?all=1  → (admin only) every claim with the holder's name/email
 */
export async function GET(req) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const all = new URL(req.url).searchParams.get("all") === "1";

  if (all) {
    if (!isAdminEmail(session.user.email)) {
      return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    }
    const rows = await db
      .select({
        id: tokenClaims.id,
        amount: tokenClaims.amount,
        destination: tokenClaims.destination,
        status: tokenClaims.status,
        txSignature: tokenClaims.txSignature,
        note: tokenClaims.note,
        createdAt: tokenClaims.createdAt,
        updatedAt: tokenClaims.updatedAt,
        holderName: users.name,
        holderEmail: users.email,
      })
      .from(tokenClaims)
      .leftJoin(users, eq(tokenClaims.userId, users.id))
      .orderBy(desc(tokenClaims.createdAt));
    return NextResponse.json({
      symbol: TOKEN_SYMBOL,
      claims: rows.map((r) => serializeClaim(r, { holderName: r.holderName, holderEmail: r.holderEmail })),
    });
  }

  const totals = await getTokenRewardTotals(db, session.user.id);
  const rows = await db
    .select()
    .from(tokenClaims)
    .where(eq(tokenClaims.userId, session.user.id))
    .orderBy(desc(tokenClaims.createdAt));
  const [linked] = await db
    .select({ wallet: tokenWallets.wallet, verifiedAt: tokenWallets.verifiedAt })
    .from(tokenWallets)
    .where(eq(tokenWallets.userId, session.user.id));

  return NextResponse.json({
    symbol: TOKEN_SYMBOL,
    configured: isTokenConfigured(),
    linkedWallet: linked?.wallet || null,
    walletVerified: Boolean(linked?.verifiedAt),
    balance: {
      earnedBase: totals.earnedBase.toString(),
      earned: formatTokens(totals.earnedBase),
      claimedBase: totals.claimedBase.toString(),
      claimed: formatTokens(totals.claimedBase),
      availableBase: totals.availableBase.toString(),
      available: formatTokens(totals.availableBase),
      availableDisplay: formatTokensPretty(totals.availableBase),
    },
    claims: rows.map((r) => serializeClaim(r)),
  });
}

/**
 * POST /api/token/claim — a holder requests a payout of accrued rewards to their
 * OWN verified wallet. Validates the amount against the derived available balance
 * inside a locked transaction, then records a pending claim for manual treasury
 * settlement (scripts/pay-claims.mjs + admin PATCH). Mirrors POST /api/withdrawals.
 */
export async function POST(req) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }
  if (!isTokenConfigured()) {
    return NextResponse.json({ error: "The token isn't live yet." }, { status: 409 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = claimSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid input" },
      { status: 400 }
    );
  }

  let amountBase;
  try {
    amountBase = parseTokens(parsed.data.amount);
  } catch (e) {
    return NextResponse.json({ error: e.message || "Invalid amount" }, { status: 400 });
  }
  if (amountBase <= 0n) {
    return NextResponse.json({ error: "Amount must be greater than zero" }, { status: 400 });
  }

  let inserted;
  try {
    inserted = await db.transaction(async (tx) => {
      const [account] = await tx.select({ id: users.id }).from(users).where(eq(users.id, session.user.id)).for("update");
      if (!account) { const error = new Error("User not found"); error.status = 404; throw error; }

      // A claim always pays the user's own VERIFIED wallet — never a client-
      // supplied address. No verified wallet → nothing to pay to.
      const [linked] = await tx
        .select({ wallet: tokenWallets.wallet, verifiedAt: tokenWallets.verifiedAt })
        .from(tokenWallets)
        .where(eq(tokenWallets.userId, session.user.id));
      if (!linked?.wallet || !linked.verifiedAt) {
        const error = new Error("Link and verify a Solana wallet before claiming.");
        error.status = 409;
        throw error;
      }

      const { availableBase } = await getTokenRewardTotals(tx, session.user.id);
      if (amountBase > availableBase) {
        const error = new Error(`Insufficient rewards. You have ${formatTokensPretty(availableBase)} ${TOKEN_SYMBOL} available.`);
        error.status = 409;
        throw error;
      }

      return tx.insert(tokenClaims).values({
        userId: session.user.id,
        amount: amountBase,
        destination: linked.wallet,
        status: "pending",
      }).returning();
    });
  } catch (error) {
    if (error.status) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }

  const who = session.user.name || session.user.email || "A holder";
  await notifyAdmins({
    type: "withdrawal",
    message: `${who} requested a ${formatTokensPretty(amountBase)} ${TOKEN_SYMBOL} claim → ${inserted[0].destination}.`,
    link: "/dashboard/token-claims",
  });

  return NextResponse.json(
    { ok: true, claim: serializeClaim(inserted[0]), message: "Claim requested — it's now pending payout." },
    { status: 201 }
  );
}

/**
 * PATCH /api/token/claim — admin settles a claim.
 * Body: { id, status: "paid" | "failed", txSignature? }. `paid` requires the
 * treasury transaction signature. Notifies the holder. Mirrors PATCH /api/withdrawals.
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
  const txSignature = typeof body?.txSignature === "string" ? body.txSignature.trim() : "";
  if (!id || typeof id !== "string" || !["paid", "failed"].includes(status)) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  // A paid claim must carry the on-chain proof it was actually sent.
  if (status === "paid" && !(txSignature.length >= 43 && txSignature.length <= 100)) {
    return NextResponse.json({ error: "Paste the treasury transaction signature." }, { status: 400 });
  }

  let result;
  try {
    result = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(tokenClaims).where(eq(tokenClaims.id, id)).for("update");
      if (!current) { const error = new Error("Claim not found"); error.status = 404; throw error; }

      // Share the POST lock order (user row) for serial safety.
      const [holder] = await tx.select({ id: users.id }).from(users).where(eq(users.id, current.userId)).for("update");
      if (!holder) { const error = new Error("Holder not found"); error.status = 404; throw error; }

      if (current.status === status) return { current, changed: false };
      if (current.status !== "pending") {
        const error = new Error(`A ${current.status} claim is final and cannot be changed.`);
        error.status = 409;
        throw error;
      }

      await tx.update(tokenClaims)
        .set({ status, txSignature: status === "paid" ? txSignature : null, updatedAt: new Date() })
        .where(eq(tokenClaims.id, current.id));
      return { current, changed: true };
    });
  } catch (error) {
    if (error.status) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }

  if (result.changed) {
    const amt = formatTokensPretty(result.current.amount);
    const message = status === "paid"
      ? `Your claim of ${amt} ${TOKEN_SYMBOL} has been paid ✅`
      : `Your claim of ${amt} ${TOKEN_SYMBOL} could not be processed and was returned to your available rewards.`;
    await notifyUser(result.current.userId, { type: "review", message, link: "/dashboard/token" });
  }

  return NextResponse.json({ ok: true, status });
}
