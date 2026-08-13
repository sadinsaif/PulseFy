export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { isAdminEmail } from "@/lib/admin";
import { getBrandWalletTotals } from "@/lib/brand-wallet";

/**
 * GET /api/wallet — the signed-in brand's wallet balances, always derived
 * server-side from brand_topups + brand_wallet_ledger (§1/§5/§19). A brand only
 * ever sees its OWN wallet: brandId is taken from the session, never the client.
 * Empty ledger → $0.00 everywhere (§20).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const [currentUser] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, session.user.id));
  const isBrand = currentUser?.role === "brand";
  if (!isBrand && !isAdminEmail(session.user.email)) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  const totals = await getBrandWalletTotals(db, session.user.id);
  return NextResponse.json({
    wallet: {
      available: totals.available,
      reserved: totals.reserved,
      total: totals.total,
    },
  });
}
