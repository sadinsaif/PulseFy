export const dynamic = "force-dynamic";

import Link from "next/link";
import { auth } from "@/auth";
import { db } from "@/db";
import { campaigns, users, submissions, referralEarnings } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import Sidebar from "@/components/Sidebar";
import TopbarSearch from "@/components/TopbarSearch";
import CampaignGrid from "@/components/CampaignGrid";
import { isAdminEmail } from "@/lib/admin";

export default async function DashboardPage() {
  const session = await auth();
  const user = session?.user;
  const firstName = (user?.name || "there").split(" ")[0];

  // Pull public campaigns so the Overview shows the real marketplace feed with
  // brand name + live submission count. Live campaigns sort above finished ones
  // (same GIMI ordering as the Discover grid); paused campaigns stay hidden.
  const subCount = sql`(select count(*) from ${submissions} where ${submissions.campaignId} = ${campaigns.id})`;
  const liveFirst = sql`case when ${campaigns.status} = 'active' and (${campaigns.endsAt} is null or ${campaigns.endsAt} > now()) then 0 else 1 end`;
  let allCampaigns = [];
  try {
    allCampaigns = await db
      .select({
        id: campaigns.id,
        title: campaigns.title,
        brief: campaigns.brief,
        platform: campaigns.platform,
        reward: campaigns.reward,
        budget: campaigns.budget,
        spotlightReward: campaigns.spotlightReward,
        performanceMult: campaigns.performanceMult,
        endsAt: campaigns.endsAt,
        status: campaigns.status,
        contentType: campaigns.contentType,
        thumbnailUrl: campaigns.thumbnailUrl,
        brandName: users.name,
        submissionCount: subCount,
      })
      .from(campaigns)
      .leftJoin(users, eq(campaigns.brandId, users.id))
      .where(sql`${campaigns.status} <> 'paused' and ${campaigns.visibility} is distinct from 'private'`)
      .orderBy(liveFirst, desc(campaigns.createdAt));
  } catch {
    allCampaigns = [];
  }

  // Real KPI numbers straight from the database — no fake stats.
  let stats = { activeCampaigns: 0, creators: 0, submissions: 0, rewardsPaid: 0 };
  try {
    const [ac] = await db
      .select({ n: sql`count(*)` })
      .from(campaigns)
      .where(sql`${campaigns.status} = 'active'`);
    const [cr] = await db
      .select({ n: sql`count(*)` })
      .from(users)
      .where(sql`${users.role} = 'creator'`);
    const [sb] = await db.select({ n: sql`count(*)` }).from(submissions);
    const [rw] = await db
      .select({ n: sql`coalesce(sum(${submissions.reward}), 0)` })
      .from(submissions)
      .where(sql`${submissions.status} = 'approved'`);
    // Spotlight bonuses are real payouts too — fold them into rewards paid.
    const [sp] = await db
      .select({ n: sql`coalesce(sum(${submissions.spotlightBonus}), 0)` })
      .from(submissions)
      .where(sql`${submissions.spotlighted} = true`);
    // Referral commissions — 5% of referred users' payouts for the first 90 days.
    // These are already in cents, so convert to dollars for the KPI display.
    const [rf] = await db
      .select({ n: sql`coalesce(sum(${referralEarnings.amount}), 0)` })
      .from(referralEarnings);
    const referralDollars = Number(rf?.n || 0) / 100;

    stats = {
      activeCampaigns: Number(ac?.n || 0),
      creators: Number(cr?.n || 0),
      submissions: Number(sb?.n || 0),
      rewardsPaid: Number(rw?.n || 0) + Number(sp?.n || 0) + referralDollars,
    };
  } catch {
    // leave zeros if the DB is unreachable
  }

  return (
    <div className="app">
      <Sidebar user={user} isAdmin={isAdminEmail(user?.email)} />

      <main className="main">
        <div className="topbar">
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div>
              <h1>Overview</h1>
              <p className="sub">
                Welcome back, {firstName} — here&apos;s what&apos;s happening across your campaigns.
              </p>
            </div>
          </div>
          <div className="topbar-actions">
            <TopbarSearch />
            <Link href="/dashboard/profile" className="btn btn-primary">My Profile</Link>
          </div>
        </div>

        {/* KPIs — real counts from the database */}
        <section className="kpis">
          <div className="kpi">
            <div className="k-top"><div className="k-ic">🎯</div></div>
            <div className="k-val">{stats.activeCampaigns.toLocaleString()}</div>
            <div className="k-lbl">Active campaigns</div>
          </div>
          <div className="kpi">
            <div className="k-top"><div className="k-ic">👥</div></div>
            <div className="k-val">{stats.creators.toLocaleString()}</div>
            <div className="k-lbl">Creators</div>
          </div>
          <div className="kpi">
            <div className="k-top"><div className="k-ic">✅</div></div>
            <div className="k-val">{stats.submissions.toLocaleString()}</div>
            <div className="k-lbl">Submissions</div>
          </div>
          <div className="kpi">
            <div className="k-top"><div className="k-ic">💸</div></div>
            <div className="k-val">${stats.rewardsPaid.toLocaleString()}</div>
            <div className="k-lbl">Rewards paid</div>
          </div>
        </section>

        {/* ALL CAMPAIGNS */}
        <section className="panel">
          <div className="panel-head">
            <h3>All campaigns</h3>
            <Link href="/dashboard/campaigns" style={{ color: "var(--accent)" }}>See all</Link>
          </div>

          {allCampaigns.length === 0 ? (
            <p className="brief" style={{ marginTop: 10 }}>
              No active campaigns yet. Brands can launch one from the Campaigns page.
            </p>
          ) : (
            <CampaignGrid campaigns={allCampaigns} now={Date.now()} style={{ marginTop: 14 }} />
          )}
        </section>
      </main>
    </div>
  );
}
