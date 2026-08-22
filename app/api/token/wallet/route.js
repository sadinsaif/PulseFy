export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { and, eq, gt } from "drizzle-orm";
import nacl from "tweetnacl";
import { PublicKey } from "@solana/web3.js";
import { auth } from "@/auth";
import { db } from "@/db";
import { tokenWallets, verificationTokens } from "@/db/schema";
import { isValidSolAddress, buildWalletLinkMessage } from "@/lib/solana";

// The nonce lives in verification_tokens (reused): identifier scopes it to this
// user + flow, token is the random nonce, and it expires fast. A signature over
// buildWalletLinkMessage(wallet, nonce) proves the user holds the wallet's key —
// this is the anti-farming gate, so a user can only link a wallet they control
// and can't accrue hold-to-earn rewards off someone else's balance.
const NONCE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const nonceIdentifier = (userId) => `wallet-link:${userId}`;

/** GET → the signed-in user's linked/verified wallet (or null). */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const [row] = await db
    .select({ wallet: tokenWallets.wallet, verifiedAt: tokenWallets.verifiedAt })
    .from(tokenWallets)
    .where(eq(tokenWallets.userId, session.user.id));
  return NextResponse.json({ wallet: row?.wallet || null, verifiedAt: row?.verifiedAt || null });
}

/**
 * POST — two actions:
 *   { action: "nonce",  wallet }              → issue a message to sign
 *   { action: "verify", wallet, signature }   → verify + link (signature = number[])
 */
export async function POST(req) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }
  const userId = session.user.id;

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const action = body?.action;
  const wallet = typeof body?.wallet === "string" ? body.wallet.trim() : "";
  if (!isValidSolAddress(wallet)) {
    return NextResponse.json({ error: "Enter a valid Solana wallet address" }, { status: 400 });
  }
  const identifier = nonceIdentifier(userId);

  // --- Step 1: issue a fresh nonce (invalidating any earlier one). -----------
  if (action === "nonce") {
    const nonce = crypto.randomUUID();
    await db
      .delete(verificationTokens)
      .where(and(eq(verificationTokens.identifier, identifier), eq(verificationTokens.purpose, "wallet_link")));
    await db.insert(verificationTokens).values({
      identifier,
      token: nonce,
      purpose: "wallet_link",
      expires: new Date(Date.now() + NONCE_TTL_MS),
    });
    return NextResponse.json({ message: buildWalletLinkMessage(wallet, nonce) });
  }

  // --- Step 2: verify the signature and link the wallet. ---------------------
  if (action === "verify") {
    const sigArray = body?.signature;
    if (!Array.isArray(sigArray) || sigArray.length !== 64) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    const [nonceRow] = await db
      .select({ token: verificationTokens.token })
      .from(verificationTokens)
      .where(
        and(
          eq(verificationTokens.identifier, identifier),
          eq(verificationTokens.purpose, "wallet_link"),
          gt(verificationTokens.expires, new Date())
        )
      );
    if (!nonceRow) {
      return NextResponse.json(
        { error: "Verification expired. Please try connecting again." },
        { status: 400 }
      );
    }

    // Re-derive the exact bytes the client signed and check them against the key.
    const message = buildWalletLinkMessage(wallet, nonceRow.token);
    let ok = false;
    try {
      ok = nacl.sign.detached.verify(
        new TextEncoder().encode(message),
        Uint8Array.from(sigArray),
        new PublicKey(wallet).toBytes()
      );
    } catch {
      ok = false;
    }
    if (!ok) {
      return NextResponse.json({ error: "Signature did not match this wallet." }, { status: 400 });
    }

    try {
      await db.transaction(async (tx) => {
        // One account per wallet: reject if another user already linked it.
        const [owner] = await tx
          .select({ userId: tokenWallets.userId })
          .from(tokenWallets)
          .where(eq(tokenWallets.wallet, wallet))
          .for("update");
        if (owner && owner.userId !== userId) {
          const error = new Error("This wallet is already linked to another account.");
          error.status = 409;
          throw error;
        }

        // One wallet per user (MVP): replace any previous link for this user.
        await tx.delete(tokenWallets).where(eq(tokenWallets.userId, userId));
        await tx.insert(tokenWallets).values({ userId, wallet, verifiedAt: new Date() });

        // Burn the nonce so a captured signature can't be replayed.
        await tx
          .delete(verificationTokens)
          .where(and(eq(verificationTokens.identifier, identifier), eq(verificationTokens.purpose, "wallet_link")));
      });
    } catch (error) {
      if (error.status) return NextResponse.json({ error: error.message }, { status: error.status });
      if (error?.code === "23505" || error?.cause?.code === "23505") {
        return NextResponse.json(
          { error: "This wallet is already linked to another account." },
          { status: 409 }
        );
      }
      throw error;
    }

    return NextResponse.json({ ok: true, wallet });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
