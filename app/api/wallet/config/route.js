export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { isAdminEmail } from "@/lib/admin";
import { isCryptoEnabled } from "@/lib/nowpayments";

/**
 * GET /api/wallet/config — client-visible wallet capabilities. Currently just
 * whether the automatic crypto top-up option should be offered. This is the
 * single source of truth the UI reads, so it never shows a "Pay with Crypto"
 * button that would immediately 503.
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

  return NextResponse.json({ cryptoEnabled: isCryptoEnabled() });
}
