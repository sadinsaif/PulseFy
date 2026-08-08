export const dynamic = "force-dynamic";

import Link from "next/link";
import { auth } from "@/auth";
import { db } from "@/db";
import { campaigns, users, submissions, referralEarnings } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import Sidebar from "@/components/Sidebar";
import TopbarSearch from "@/components/TopbarSearch";
import CampaignGrid from "@/components/CampaignGrid";
import PerfChart from "@/components/PerfChart";
import { isAdminEmail } from "@/lib/admin";

export default async function DashboardPage() {
  const session = await auth();
  const user = session?.user;
  const firstName = (user?.name || "there").split(" ")[0];
  const isBrand = user?.role === "brand";

  // ---- BRAND OVERVIEW ------------------------------------------------------
  // Brands get a business-focused Overview: KPIs + campaign performance, all
  // derived from their own campaigns/submissions. The creator/admin path below
  // is left exactly as-is.
  if (isBrand) {
    const me = user.id;
    let bstats = { active: 0, spend: 0, content: 0, hired: 0, views: 0, engagement: 0 };
    let perf = [];
    try {
      const [ac] = await db
        .select({ n: sql`count(*)` })
        .from(campaigns)
        .where(
          sql`${campaigns.brandId} = ${me} and ${campaigns.status} = 'active' and (${campaigns.endsAt} is null or ${campaigns.endsAt} > now())`
        );

      const spendExpr = sql`coalesce(sum(case when ${submissions.status} = 'approved' then ${submissions.reward} else 0 end), 0)
        + coalesce(sum(case when ${submissions.spotlighted} = true then ${submissions.spotlightBonus} else 0 end), 0)`;

      const [agg] = await db
        .select({
          spend: spendExpr,
          content: sql`count(${submissions.id})`,
          hired: sql`count(distinct case when ${submissions.status} = 'approved' then ${submissions.userId} end)`,
          views: sql`coalesce(sum(${submissions.views}), 0)`,
          engagement: sql`coalesce(sum(${submissions.engagement}), 0)`,
        })
        .from(submissions)
        .innerJoin(campaigns, eq(submissions.campaignId, campaigns.id))
        .where(eq(campaigns.brandId, me));

      bstats = {
        active: Number(ac?.n || 0),
        spend: Number(agg?.spend || 0),
        content: Number(agg?.content || 0),
        hired: Number(agg?.hired || 0),
        views: Number(agg?.views || 0),
        engagement: Number(agg?.engagement || 0),
      };

      // Per-campaign performance for the chart (top 8 by views). leftJoin so a
      // campaign with no submissions still appears (as a zero bar).
      perf = await db
        .select({
          label: campaigns.title,
          views: sql`coalesce(sum(${submissions.views}), 0)`,
          spend: spendExpr,
        })
        .from(campaigns)
        .leftJoin(submissions, eq(submissions.campaignId, campaigns.id))
        .where(eq(campaigns.brandId, me))
        .groupBy(campaigns.id, campaigns.title)
        .orderBy(desc(sql`coalesce(sum(${submissions.views}), 0)`))
        .limit(8);
    } catch {
      // leave zeros if the DB is unreachable
    }

    const chartData = perf.map((p) => ({
      label: p.label,
      primary: Number(p.views || 0),
      secondary: Number(p.spend || 0),
    }));

    return (
      <div className="app">
        <Sidebar user={user} isAdmin={isAdminEmail(user?.email)} />

        <main className="main">
          <div className="topbar">
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div>
                <h1>Overview</h1>
                <p className="sub">
                  Welcome back, {firstName} — here&apos;s how your campaigns are performing.
                </p>
              </div>
            </div>
            <div className="topbar-actions">
              <TopbarSearch to="/dashboard/discover" />
              <Link href="/dashboard/campaigns?new=1" className="btn btn-primary">
                + Create Campaign
              </Link>
            </div>
          </div>

          {/* Brand KPIs */}
          <section className="kpis">
            <div className="kpi">
              <div className="k-top"><div className="k-ic">🎯</div></div>
              <div className="k-val">{bstats.active.toLocaleString()}</div>
              <div className="k-lbl">Active campaigns</div>
            </div>
            <div className="kpi">
              <div className="k-top"><div className="k-ic">💰</div></div>
              <div className="k-val">${bstats.spend.toLocaleString()}</div>
              <div className="k-lbl">Total campaign spend</div>
            </div>
            <div className="kpi">
              <div className="k-top"><div className="k-ic">🎬</div></div>
              <div className="k-val">{bstats.content.toLocaleString()}</div>
              <div className="k-lbl">Content received</div>
            </div>
            <div className="kpi">
              <div className="k-top"><div className="k-ic">🤝</div></div>
              <div className="k-val">{bstats.hired.toLocaleString()}</div>
              <div className="k-lbl">Creators hired</div>
            </div>
          </section>

          {/* Campaign performance */}
          <section className="panel">
            <div className="panel-head">
              <h3>Campaign performance</h3>
              <Link href="/dashboard/analytics" style={{ color: "var(--accent)" }}>
                Full analytics
              </Link>
            </div>

            <div className="perf-tiles">
              <div className="perf-tile">
                <div className="pt-val">{bstats.views.toLocaleString()}</div>
                <div className="pt-lbl">Total views</div>
              </div>
              <div className="perf-tile">
                <div className="pt-val">{bstats.engagement.toLocaleString()}</div>
                <div className="pt-lbl">Engagement</div>
              </div>
              <div className="perf-tile">
                <div className="pt-val">{bstats.content.toLocaleString()}</div>
                <div className="pt-lbl">Content created</div>
              </div>
              <div className="perf-tile">
                <div className="pt-val">{bstats.hired.toLocaleString()}</div>
                <div className="pt-lbl">Creators hired</div>
              </div>
              <div className="perf-tile">
                <div className="pt-val">${bstats.spend.toLocaleString()}</div>
                <div className="pt-lbl">Total spend</div>
              </div>
            </div>

            <PerfChart
              data={chartData}
              primaryLabel="Views"
              secondaryLabel="Spend"
              primaryFormat="compact"
              secondaryFormat="money"
            />
          </section>
        </main>
      </div>
    );
  }


  // Pull public campaigns so the Overview shows the real marketplace feed with
  // brand name + live submission count. Live campaigns sort above finished ones
  // (same GIMI ordering as the Discover grid); paused campaigns stay hidden.
  const subCount = sql`(select count(*) from ${submissions} where ${submissions.campaignId} = ${campaigns.id})`;
  // Dollars paid out of the pool so far (approved rewards + spotlight bonuses);
  // the card shows budget minus this so the pool ticks down as posts get paid.
  const budgetSpent = sql`(
    (select coalesce(sum(${submissions.reward}), 0) from ${submissions}
       where ${submissions.campaignId} = ${campaigns.id} and ${submissions.status} = 'approved')
    + (select coalesce(sum(${submissions.spotlightBonus}), 0) from ${submissions}
       where ${submissions.campaignId} = ${campaigns.id} and ${submissions.spotlighted} = true)
  )`;
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
        budgetSpent,
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

  // ---- CREATOR OVERVIEW ---------------------------------------------------
  // A real creator gets KPIs scoped to their own account (not platform-wide).
  // Admins fall through to the global marketplace stats below, unchanged.
  const admin = isAdminEmail(user?.email);
  if (!admin) {
    const me = user.id;
    let cstats = { active: 0, submissions: 0, approved: 0, earnings: 0 };
    try {
      // Distinct live campaigns this creator has submitted to.
      const [ac] = await db
        .select({ n: sql`count(distinct ${campaigns.id})` })
        .from(submissions)
        .innerJoin(campaigns, eq(submissions.campaignId, campaigns.id))
        .where(
          sql`${submissions.userId} = ${me} and ${campaigns.status} = 'active' and (${campaigns.endsAt} is null or ${campaigns.endsAt} > now())`
        );

      const [sb] = await db
        .select({ n: sql`count(*)` })
        .from(submissions)
        .where(eq(submissions.userId, me));

      const [ap] = await db
        .select({ n: sql`count(*)` })
        .from(submissions)
        .where(
          sql`${submissions.userId} = ${me} and ${submissions.status} = 'approved'`
        );

      // Total earnings = approved rewards + spotlight bonuses (whole dollars)
      // + referral commissions (stored in cents). Mirrors getBalanceCents.
      const [er] = await db
        .select({ n: sql`coalesce(sum(${submissions.reward}), 0)` })
        .from(submissions)
        .where(
          sql`${submissions.userId} = ${me} and ${submissions.status} = 'approved'`
        );
      const [sr] = await db
        .select({ n: sql`coalesce(sum(${submissions.spotlightBonus}), 0)` })
        .from(submissions)
        .where(
          sql`${submissions.userId} = ${me} and ${submissions.spotlighted} = true`
        );
      const [rr] = await db
        .select({ n: sql`coalesce(sum(${referralEarnings.amount}), 0)` })
        .from(referralEarnings)
        .where(eq(referralEarnings.referrerId, me));

      cstats = {
        active: Number(ac?.n || 0),
        submissions: Number(sb?.n || 0),
        approved: Number(ap?.n || 0),
        earnings: Number(er?.n || 0) + Number(sr?.n || 0) + Number(rr?.n || 0) / 100,
      };
    } catch {
      // leave zeros if the DB is unreachable
    }

    return (
      <div className="app">
        <Sidebar user={user} isAdmin={false} />

        <main className="main">
          <div className="topbar">
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div>
                <h1>Overview</h1>
                <p className="sub">
                  Welcome back, {firstName} — here&apos;s how your clips are performing.
                </p>
              </div>
            </div>
            <div className="topbar-actions">
              <TopbarSearch />
              <Link href="/dashboard/profile" className="btn btn-primary">My Profile</Link>
            </div>
          </div>

          {/* Creator KPIs — scoped to this account */}
          <section className="kpis">
            <div className="kpi">
              <div className="k-top"><div className="k-ic">🎯</div></div>
              <div className="k-val">{cstats.active.toLocaleString()}</div>
              <div className="k-lbl">Active campaigns</div>
            </div>
            <div className="kpi">
              <div className="k-top"><div className="k-ic">🎬</div></div>
              <div className="k-val">{cstats.submissions.toLocaleString()}</div>
              <div className="k-lbl">My submissions</div>
            </div>
            <div className="kpi">
              <div className="k-top"><div className="k-ic">✅</div></div>
              <div className="k-val">{cstats.approved.toLocaleString()}</div>
              <div className="k-lbl">Approved posts</div>
            </div>
            <div className="kpi">
              <div className="k-top"><div className="k-ic">💰</div></div>
              <div className="k-val">${cstats.earnings.toLocaleString()}</div>
              <div className="k-lbl">Total earnings</div>
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
                No active campaigns yet. Check back soon — brands post new ones regularly.
              </p>
            ) : (
              <CampaignGrid campaigns={allCampaigns} now={Date.now()} style={{ marginTop: 14 }} />
            )}
          </section>
        </main>
      </div>
    );
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
