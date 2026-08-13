export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { isAdminEmail } from "@/lib/admin";
import { getBrandTransactions } from "@/lib/brand-wallet";

const ALLOWED_FILTERS = ["all", "topups", "campaigns", "payouts"];

/**
 * GET /api/wallet/transactions?type=all|topups|campaigns|payouts
 * The signed-in brand's real, read-only transaction history (§12/§15/§20).
 * Brand-scoped: brandId comes from the session, never the client (§19). No
 * synthetic rows — an empty history returns [].
 */
export async function GET(req) {
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

  let type = new URL(req.url).searchParams.get("type") || "all";
  if (!ALLOWED_FILTERS.includes(type)) type = "all";

  const transactions = await getBrandTransactions(db, session.user.id, type);
  return NextResponse.json({ transactions });
}
