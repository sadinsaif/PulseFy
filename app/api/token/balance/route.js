export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { tokenWallets } from "@/db/schema";
import {
  getSplBalanceBase,
  formatTokens,
  isTokenConfigured,
  isValidSolAddress,
  TOKEN_SYMBOL,
  TOKEN_DECIMALS,
} from "@/lib/solana";

/**
 * GET /api/token/balance
 *   default        → on-chain $PULSE balance of the user's VERIFIED linked wallet
 *   ?address=<pk>  → balance of a specific address (preview before linking)
 *
 * Balances are BASE UNITS (BigInt) — JSON can't carry BigInt, so we return the
 * raw base string plus a decimal display string. The client can also read this
 * straight from the connected wallet via lib/solana; this route exists so the
 * dashboard can show the LINKED wallet regardless of what's connected right now.
 */
export async function GET(req) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  if (!isTokenConfigured()) {
    return NextResponse.json({
      configured: false,
      symbol: TOKEN_SYMBOL,
      decimals: TOKEN_DECIMALS,
      wallet: null,
      balanceBase: "0",
      balance: "0",
    });
  }

  const override = new URL(req.url).searchParams.get("address");
  let wallet = null;
  if (override) {
    if (!isValidSolAddress(override)) {
      return NextResponse.json({ error: "Invalid address" }, { status: 400 });
    }
    wallet = override;
  } else {
    const [row] = await db
      .select({ wallet: tokenWallets.wallet })
      .from(tokenWallets)
      .where(eq(tokenWallets.userId, session.user.id));
    wallet = row?.wallet || null;
  }

  if (!wallet) {
    return NextResponse.json({
      configured: true,
      symbol: TOKEN_SYMBOL,
      decimals: TOKEN_DECIMALS,
      wallet: null,
      balanceBase: "0",
      balance: "0",
    });
  }

  let base = 0n;
  try {
    base = await getSplBalanceBase(wallet);
  } catch (e) {
    return NextResponse.json({ error: "Could not read on-chain balance. Try again." }, { status: 502 });
  }

  return NextResponse.json({
    configured: true,
    symbol: TOKEN_SYMBOL,
    decimals: TOKEN_DECIMALS,
    wallet,
    balanceBase: base.toString(),
    balance: formatTokens(base),
  });
}
