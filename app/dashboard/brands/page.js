export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { db } from "@/db";
import { moderationEvents, users, campaigns, submissions } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import Sidebar from "@/components/Sidebar";
import AdminBrands from "@/components/AdminBrands";
import { isAdminEmail } from "@/lib/admin";

/**
 * /dashboard/brands — admin-only brand management. Lists every brand account
 * with campaign counts, active campaigns and total spend across their
 * campaigns. Non-admins get the same friendly "for admins" stub the other
 * admin-only surfaces use, so nothing leaks and no creator/brand route breaks.
 */
export default async function BrandsPage() {
  const session = await auth();
  const user = session?.user;
  const admin = isAdminEmail(user?.email);

  if (!admin) {
    return (
      <div className="app">
        <Sidebar user={user} isAdmin={false} />
        <main className="main">
          <div className="topbar">
            <div>
              <h1>Brands</h1>
              <p className="sub">This area is for platform admins.</p>
            </div>
          </div>
          <section className="panel">
            <p className="brief" style={{ marginTop: 4 }}>
              You don&apos;t have access to brand management.
            </p>
          </section>
        </main>
      </div>
    );
  }

  // Per-brand aggregates via correlated subqueries. Spend = approved rewards +
  // spotlight bonuses across the brand's own campaigns (matches budgetSpent).
  const campaignCount = sql`(select count(*) from ${campaigns} where ${campaigns.brandId} = ${users.id})`;
  const activeCount = sql`(select count(*) from ${campaigns} where ${campaigns.brandId} = ${users.id} and ${campaigns.status} = 'active')`;
  const spend = sql`(
    (select coalesce(sum(${submissions.reward}), 0) from ${submissions}
       join ${campaigns} on ${submissions.campaignId} = ${campaigns.id}
       where ${campaigns.brandId} = ${users.id} and ${submissions.status} = 'approved')
    + (select coalesce(sum(${submissions.spotlightBonus}), 0) from ${submissions}
       join ${campaigns} on ${submissions.campaignId} = ${campaigns.id}
       where ${campaigns.brandId} = ${users.id} and ${submissions.spotlighted} = true)
  )`;
  const warnings = sql`(select count(*) from moderation_events where moderation_events.target_user_id = ${users.id} and moderation_events.action = 'warning')`;

  let rows = [];
  try {
    const raw = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        company: users.company,
        moderationStatus: users.moderationStatus,
        isVerified: users.isVerified,
        suspendedUntil: users.suspendedUntil,
        createdAt: users.createdAt,
        campaigns: campaignCount,
        active: activeCount,
        spend,
        warnings,
      })
      .from(users)
      .where(eq(users.role, "brand"))
      .orderBy(desc(users.createdAt));

    rows = raw.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      company: r.company,
      moderationStatus: r.moderationStatus,
      isVerified: r.isVerified,
      suspendedUntil: r.suspendedUntil ? new Date(r.suspendedUntil).toISOString() : null,
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
      campaigns: Number(r.campaigns || 0),
      active: Number(r.active || 0),
      spend: Number(r.spend || 0),
      warnings: Number(r.warnings || 0),
    }));
  } catch {
    rows = [];
  }

  return (
    <div className="app">
      <Sidebar user={user} isAdmin={admin} />
      <main className="main">
        <div className="topbar">
          <div>
            <h1>Brands</h1>
            <p className="sub">
              Every brand on PulseFy — campaigns, activity and total spend.
            </p>
          </div>
        </div>

        <AdminBrands rows={rows} />
      </main>
    </div>
  );
}
