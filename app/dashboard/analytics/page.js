export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { db } from "@/db";
import { campaigns, submissions, referralEarnings } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import Sidebar from "@/components/Sidebar";
import PerfChart from "@/components/PerfChart";
import { isAdminEmail } from "@/lib/admin";

/**
 * /dashboard/analytics — brand-only (admins see platform-wide). Premium KPI
 * tiles + charts, all derived from the brand's campaigns/submissions. Non-brand
 * users get a friendly stub so no data leaks and the creator UI is untouched.
 */
export default async function AnalyticsPage() {
  const session = await auth();
  const user = session?.user;
  const admin = isAdminEmail(user?.email);
  const isBrand = user?.role === "brand";

  // ---- CREATOR: their own performance across every campaign ----
  if (!isBrand && !admin) {
    let cstats = { views: 0, submissions: 0, approved: 0, earnings: 0 };
    let cperf = [];
    try {
      const [agg] = await db
        .select({
          views: sql`coalesce(sum(${submissions.views}), 0)`,
          submissions: sql`count(${submissions.id})`,
          approved: sql`count(case when ${submissions.status} = 'approved' then 1 end)`,
          reward: sql`coalesce(sum(case when ${submissions.status} = 'approved' then ${submissions.reward} else 0 end), 0)`,
          spotlight: sql`coalesce(sum(case when ${submissions.spotlighted} = true then ${submissions.spotlightBonus} else 0 end), 0)`,
        })
        .from(submissions)
        .where(eq(submissions.userId, user.id));

      const [ref] = await db
        .select({ n: sql`coalesce(sum(${referralEarnings.amount}), 0)` })
        .from(referralEarnings)
        .where(eq(referralEarnings.referrerId, user.id));

      cstats = {
        views: Number(agg?.views || 0),
        submissions: Number(agg?.submissions || 0),
        approved: Number(agg?.approved || 0),
        earnings:
          Number(agg?.reward || 0) +
          Number(agg?.spotlight || 0) +
          Number(ref?.n || 0) / 100,
      };

      // Per-campaign views for this creator (top 8). Legacy rows with a null
      // campaignId naturally drop from the chart but still count in the KPIs.
      cperf = await db
        .select({
          label: campaigns.title,
          views: sql`coalesce(sum(${submissions.views}), 0)`,
        })
        .from(submissions)
        .innerJoin(campaigns, eq(submissions.campaignId, campaigns.id))
        .where(eq(submissions.userId, user.id))
        .groupBy(campaigns.id, campaigns.title)
        .orderBy(desc(sql`coalesce(sum(${submissions.views}), 0)`))
        .limit(8);
    } catch {
      /* leave zeros */
    }

    const cperfData = cperf.map((p) => ({
      label: p.label,
      primary: Number(p.views || 0),
    }));

    const ctiles = [
      { ic: "👁️", val: cstats.views.toLocaleString(), lbl: "Total views" },
      { ic: "🎬", val: cstats.submissions.toLocaleString(), lbl: "Total submissions" },
      { ic: "✅", val: cstats.approved.toLocaleString(), lbl: "Approved posts" },
      { ic: "💰", val: `$${cstats.earnings.toLocaleString()}`, lbl: "Total earnings" },
    ];

    return (
      <div className="app">
        <Sidebar user={user} isAdmin={false} />
        <main className="main">
          <div className="topbar">
            <div>
              <h1>Analytics</h1>
              <p className="sub">
                How your clips are performing across every campaign.
              </p>
            </div>
          </div>

          <section className="kpis">
            {ctiles.map((t) => (
              <div className="kpi" key={t.lbl}>
                <div className="k-top"><div className="k-ic">{t.ic}</div></div>
                <div className="k-val">{t.val}</div>
                <div className="k-lbl">{t.lbl}</div>
              </div>
            ))}
          </section>

          <section className="panel" style={{ marginTop: 18 }}>
            <div className="panel-head">
              <h3>Campaign performance</h3>
            </div>
            <PerfChart
              data={cperfData}
              primaryLabel="Views"
              primaryFormat="compact"
            />
          </section>
        </main>
      </div>
    );
  }

  const scoped = !admin; // brands see only their own campaigns
  let stats = { views: 0, engagement: 0, content: 0, hired: 0, spend: 0 };
  let perf = [];
  try {
    const spendExpr = sql`coalesce(sum(case when ${submissions.status} = 'approved' then ${submissions.reward} else 0 end), 0)
      + coalesce(sum(case when ${submissions.spotlighted} = true then ${submissions.spotlightBonus} else 0 end), 0)`;

    // Headline aggregates.
    const aggBase = db
      .select({
        views: sql`coalesce(sum(${submissions.views}), 0)`,
        engagement: sql`coalesce(sum(${submissions.engagement}), 0)`,
        content: sql`count(${submissions.id})`,
        hired: sql`count(distinct case when ${submissions.status} = 'approved' then ${submissions.userId} end)`,
        spend: spendExpr,
      })
      .from(submissions)
      .innerJoin(campaigns, eq(submissions.campaignId, campaigns.id));

    const [agg] = scoped
      ? await aggBase.where(eq(campaigns.brandId, user.id))
      : await aggBase;

    stats = {
      views: Number(agg?.views || 0),
      engagement: Number(agg?.engagement || 0),
      content: Number(agg?.content || 0),
      hired: Number(agg?.hired || 0),
      spend: Number(agg?.spend || 0),
    };

    // Per-campaign performance (top 8 by views).
    const perfBase = db
      .select({
        label: campaigns.title,
        views: sql`coalesce(sum(${submissions.views}), 0)`,
        engagement: sql`coalesce(sum(${submissions.engagement}), 0)`,
        spend: spendExpr,
      })
      .from(campaigns)
      .leftJoin(submissions, eq(submissions.campaignId, campaigns.id));

    perf = scoped
      ? await perfBase
          .where(eq(campaigns.brandId, user.id))
          .groupBy(campaigns.id, campaigns.title)
          .orderBy(desc(sql`coalesce(sum(${submissions.views}), 0)`))
          .limit(8)
      : await perfBase
          .groupBy(campaigns.id, campaigns.title)
          .orderBy(desc(sql`coalesce(sum(${submissions.views}), 0)`))
          .limit(8);
  } catch {
    /* leave zeros */
  }

  const viewsSpend = perf.map((p) => ({
    label: p.label,
    primary: Number(p.views || 0),
    secondary: Number(p.spend || 0),
  }));
  const engagementData = perf.map((p) => ({
    label: p.label,
    primary: Number(p.engagement || 0),
  }));

  const tiles = [
    { ic: "👁️", val: stats.views.toLocaleString(), lbl: "Total views" },
    { ic: "❤️", val: stats.engagement.toLocaleString(), lbl: "Total engagement" },
    { ic: "🎬", val: stats.content.toLocaleString(), lbl: "Content created" },
    { ic: "🤝", val: stats.hired.toLocaleString(), lbl: "Creators hired" },
    { ic: "💰", val: `$${stats.spend.toLocaleString()}`, lbl: "Total campaign spend" },
  ];

  return (
    <div className="app">
      <Sidebar user={user} isAdmin={admin} />

      <main className="main">
        <div className="topbar">
          <div>
            <h1>Analytics</h1>
            <p className="sub">
              {admin
                ? "Platform-wide campaign performance."
                : "How your campaigns are performing across every platform."}
            </p>
          </div>
        </div>

        <section className="kpis kpis-5">
          {tiles.map((t) => (
            <div className="kpi" key={t.lbl}>
              <div className="k-top"><div className="k-ic">{t.ic}</div></div>
              <div className="k-val">{t.val}</div>
              <div className="k-lbl">{t.lbl}</div>
            </div>
          ))}
        </section>

        <section className="panel">
          <div className="panel-head">
            <h3>Views &amp; spend by campaign</h3>
          </div>
          <PerfChart
            data={viewsSpend}
            primaryLabel="Views"
            secondaryLabel="Spend"
            primaryFormat="compact"
            secondaryFormat="money"
          />
        </section>

        <section className="panel" style={{ marginTop: 18 }}>
          <div className="panel-head">
            <h3>Engagement by campaign</h3>
          </div>
          <PerfChart
            data={engagementData}
            primaryLabel="Engagement"
            primaryFormat="compact"
          />
        </section>
      </main>
    </div>
  );
}
