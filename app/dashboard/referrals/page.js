export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { db } from "@/db";
import { users, referralEarnings } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import Sidebar from "@/components/Sidebar";
import ReferralCard from "@/components/ReferralCard";
import { isAdminEmail } from "@/lib/admin";

/**
 * Referrals dashboard — a creator's invite link + earnings (Mimix-style).
 * Referrers earn 5% of their referred users' payouts for the first 90 days.
 */
export default async function ReferralsPage() {
  const session = await auth();
  const user = session?.user;
  const admin = isAdminEmail(user?.email);

  // Pull the user's username (for the link) + referral stats straight from the
  // DB so there's no client fetch/loading flicker.
  let username = "";
  let referredCount = 0;
  let earnedCents = 0;
  try {
    const [u] = await db
      .select({ username: users.username })
      .from(users)
      .where(eq(users.id, user.id));
    username = u?.username || "";

    const [rc] = await db
      .select({ count: sql`count(*)` })
      .from(users)
      .where(eq(users.referredBy, user.id));
    referredCount = Number(rc?.count || 0);

    const [ec] = await db
      .select({ total: sql`coalesce(sum(${referralEarnings.amount}), 0)` })
      .from(referralEarnings)
      .where(eq(referralEarnings.referrerId, user.id));
    earnedCents = Number(ec?.total || 0);
  } catch {
    // leave defaults if the DB is unreachable
  }

  return (
    <div className="app">
      <Sidebar user={user} isAdmin={admin} />
      <main className="main">
        <div className="topbar">
          <div>
            <h1>Referrals</h1>
            <p className="sub">
              Refer others and earn 5% of their payouts for the first 90 days.
            </p>
          </div>
        </div>

        <ReferralCard
          username={username}
          referredCount={referredCount}
          earnedCents={earnedCents}
        />

        <div className="how-it-works">
          <h3>How it works</h3>
          <ol>
            <li>Share your referral link with creators you know.</li>
            <li>
              When they sign up using your link, they become your referral.
            </li>
            <li>
              For the first 90 days, you earn 5% of every payout they receive
              (after their withdrawal is marked paid by admin).
            </li>
            <li>
              Your referral earnings are added to your balance and can be
              withdrawn anytime.
            </li>
          </ol>
        </div>
      </main>
    </div>
  );
}
