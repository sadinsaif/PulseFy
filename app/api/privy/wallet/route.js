export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { fetchPrivyUser, extractPrivyIdentity, isPrivyConfigured } from "@/lib/privy-server";

/**
 * POST /api/privy/wallet — capture the caller's embedded Privy wallet address.
 *
 * Embedded-wallet creation can lag the first login, so the bridge in auth.js may
 * not have seen the wallet at sign-in. The client pings this once its Privy
 * wallet exists. The address is re-read SERVER-SIDE from Privy by the caller's
 * stored privy_id — a client-supplied address is never accepted — and only the
 * caller's own row is updated. Idempotent: once a wallet is stored, later calls
 * short-circuit.
 */

// Best-effort per-user throttle (per server instance). The route is idempotent
// and short-circuits once the wallet is stored, so this only bounds churn from a
// misbehaving client. Not a security control.
const RATE = new Map(); // userId -> last-attempt epoch ms
const RATE_WINDOW_MS = 10_000;

export async function POST() {
  if (!isPrivyConfigured()) {
    return NextResponse.json({ error: "Privy not enabled" }, { status: 404 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const userId = session.user.id;

  const last = RATE.get(userId) || 0;
  const now = Date.now();
  if (now - last < RATE_WINDOW_MS) {
    return NextResponse.json({ error: "Slow down." }, { status: 429 });
  }
  RATE.set(userId, now);

  const [me] = await db
    .select({ id: users.id, privyId: users.privyId, walletAddress: users.walletAddress })
    .from(users)
    .where(eq(users.id, userId));
  if (!me) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }
  if (!me.privyId) {
    return NextResponse.json({ error: "No linked Privy account" }, { status: 400 });
  }
  // Already captured — nothing to do.
  if (me.walletAddress) {
    return NextResponse.json({ ok: true, walletAddress: me.walletAddress, changed: false });
  }

  const privyUser = await fetchPrivyUser(me.privyId);
  const { walletAddress } = extractPrivyIdentity(privyUser || {});
  if (!walletAddress) {
    return NextResponse.json({ ok: true, walletAddress: null, changed: false });
  }

  await db.update(users).set({ walletAddress }).where(eq(users.id, me.id));
  return NextResponse.json({ ok: true, walletAddress, changed: true });
}
