export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { db } from "@/db";
import { moderationEvents, users } from "@/db/schema";
import { desc, sql } from "drizzle-orm";
import Sidebar from "@/components/Sidebar";
import Leaderboard from "@/components/Leaderboard";
import AdminCreators from "@/components/AdminCreators";
import { isAdminEmail } from "@/lib/admin";

/**
 * /dashboard/creators
 *   • Admin  → creator-management table (submissions, approvals, earnings).
 *   • Others → the public Leaderboard, exactly as before.
 */
export default async function LeaderboardPage({ searchParams }) {
  const session = await auth();
  const user = session?.user;
  const admin = isAdminEmail(user?.email);
  const initialQ = typeof searchParams?.q === "string" ? searchParams.q : "";

  // ---- ADMIN: creator management ------------------------------------------
  // Per-creator aggregates (subquery expressions copied from /api/creators so
  // the numbers match the leaderboard). Everyone who isn't a brand is a creator.
  let adminRows = [];
  if (admin) {
    try {
      const submissionCount = sql`(select count(*) from submissions where submissions.user_id = ${users.id})`;
      const approved = sql`(select count(*) from submissions where submissions.user_id = ${users.id} and submissions.status = 'approved')`;
      const earnings = sql`(
        (select coalesce(sum(reward),0) from submissions where submissions.user_id = ${users.id} and submissions.status = 'approved')
        + (select coalesce(sum(spotlight_bonus),0) from submissions where submissions.user_id = ${users.id} and submissions.spotlighted = true)
      )`;
      const warnings = sql`(select count(*) from moderation_events where moderation_events.target_user_id = ${users.id} and moderation_events.action = 'warning')`;

      const raw = await db
        .select({
          id: users.id,
          name: users.name,
          username: users.username,
          email: users.email,
          moderationStatus: users.moderationStatus,
          isVerified: users.isVerified,
          suspendedUntil: users.suspendedUntil,
          createdAt: users.createdAt,
          submissions: submissionCount,
          approved,
          earnings,
          warnings,
        })
        .from(users)
        .where(sql`${users.role} is distinct from 'brand'`)
        .orderBy(desc(earnings))
        .limit(500);

      adminRows = raw.map((r) => ({
        id: r.id,
        name: r.name,
        username: r.username,
        email: r.email,
        moderationStatus: r.moderationStatus,
        isVerified: r.isVerified,
        suspendedUntil: r.suspendedUntil ? new Date(r.suspendedUntil).toISOString() : null,
        createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
        submissions: Number(r.submissions || 0),
        approved: Number(r.approved || 0),
        earnings: Number(r.earnings || 0),
        warnings: Number(r.warnings || 0),
      }));
    } catch {
      adminRows = [];
    }
  }

  return (
    <div className="app">
      <Sidebar user={user} isAdmin={admin} />
      <main className="main">
        <div className="topbar">
          <div>
            <h1>{admin ? "Creators" : "Leaderboard"}</h1>
            <p className="sub">
              {admin
                ? "Every creator on PulseFy — submissions, approvals and earnings."
                : "Top creators ranked by total earnings — highest first."}
            </p>
          </div>
        </div>
        {admin ? (
          <AdminCreators rows={adminRows} />
        ) : (
          <Leaderboard initialQ={initialQ} />
        )}
      </main>
    </div>
  );
}
