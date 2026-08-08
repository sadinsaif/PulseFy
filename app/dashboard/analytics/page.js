export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { db } from "@/db";
import { campaigns, submissions } from "@/db/schema";
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

  if (!isBrand && !admin) {
    return (
      <div className="app">
        <Sidebar user={user} isAdmin={admin} />
        <main className="main">
          <div className="topbar">
            <div>
              <h1>Analytics</h1>
              <p className="sub">This area is for brands.</p>
            </div>
          </div>
          <section className="panel">
            <p className="brief">
              Campaign analytics are for brands. Head to <b>Campaigns</b> to find
              work and track your own submissions from your profile.
            </p>
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
