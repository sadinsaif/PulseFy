export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { users, referralEarnings } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

/**
 * GET /api/referrals
 * Returns the signed-in user's referral stats: how many users they've referred,
 * and the total commission they've earned (in cents, converted to dollars for
 * display). Used by the /dashboard/referrals page to show the Mimix-style card.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const userId = session.user.id;

  // Count how many users signed up with this user's referral link.
  const [rc] = await db
    .select({ count: sql`count(*)` })
    .from(users)
    .where(eq(users.referredBy, userId));

  const referredCount = Number(rc?.count || 0);

  // Sum the total commission this user has earned (in cents). referralEarnings
  // rows are created when a referred user's withdrawal is marked PAID, so the
  // sum is always withdrawable (already funded by the platform).
  const [ec] = await db
    .select({ total: sql`coalesce(sum(${referralEarnings.amount}), 0)` })
    .from(referralEarnings)
    .where(eq(referralEarnings.referrerId, userId));

  const earnedCents = Number(ec?.total || 0);

  return NextResponse.json({
    referredCount,
    earnedCents, // frontend can display as (earnedCents / 100).toFixed(2)
  });
}
