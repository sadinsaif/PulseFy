export const dynamic = "force-dynamic";

import Link from "next/link";
import { auth } from "@/auth";
import { db } from "@/db";
import { campaigns, users, submissions } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import Sidebar from "@/components/Sidebar";
import Chart from "@/components/Chart";
import TopbarSearch from "@/components/TopbarSearch";
import { isAdminEmail } from "@/lib/admin";

const PLABEL = {
  any: "Any platform",
  tiktok: "🎵 TikTok",
  instagram: "📸 Instagram",
  youtube: "▶️ YouTube",
  x: "𝕏 X",
};

const CONTENT_TYPE_LABEL = {
  ugc: "UGC",
  edit: "Edit",
  ai: "AI Generated",
  open: "Open Format",
};

export default async function DashboardPage() {
  const session = await auth();
  const user = session?.user;
  const firstName = (user?.name || "there").split(" ")[0];

  // Pull every active, public campaign so the Overview shows the real
  // marketplace feed (newest first) with brand name + live submission count.
  const subCount = sql`(select count(*) from ${submissions} where ${submissions.campaignId} = ${campaigns.id})`;
  let allCampaigns = [];
  try {
    allCampaigns = await db
      .select({
        id: campaigns.id,
        title: campaigns.title,
        brief: campaigns.brief,
        platform: campaigns.platform,
        reward: campaigns.reward,
        status: campaigns.status,
        contentType: campaigns.contentType,
        thumbnailUrl: campaigns.thumbnailUrl,
        brandName: users.name,
        submissionCount: subCount,
      })
      .from(campaigns)
      .leftJoin(users, eq(campaigns.brandId, users.id))
      .where(sql`${campaigns.status} = 'active' and ${campaigns.visibility} is distinct from 'private'`)
      .orderBy(desc(campaigns.createdAt));
  } catch {
    allCampaigns = [];
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
            <Link href="/dashboard/campaigns" className="btn btn-primary">Go to Campaigns</Link>
          </div>
        </div>

        {/* KPIs */}
        <section className="kpis">
          <div className="kpi">
            <div className="k-top"><div className="k-ic">🎯</div><span className="chip up">+12%</span></div>
            <div className="k-val">24</div>
            <div className="k-lbl">Active challenges</div>
          </div>
          <div className="kpi">
            <div className="k-top"><div className="k-ic">👥</div><span className="chip up">+8.4%</span></div>
            <div className="k-val">3,182</div>
            <div className="k-lbl">Creators engaged</div>
          </div>
          <div className="kpi">
            <div className="k-top"><div className="k-ic">✅</div><span className="chip up">+21%</span></div>
            <div className="k-val">1,940</div>
            <div className="k-lbl">Submissions</div>
          </div>
          <div className="kpi">
            <div className="k-top"><div className="k-ic">💸</div><span className="chip down">-3%</span></div>
            <div className="k-val">$48.2k</div>
            <div className="k-lbl">Rewards paid</div>
          </div>
        </section>

        {/* PANELS */}
        <section className="panels">
          <div className="panel">
            <div className="panel-head">
              <h3>Submissions this week</h3>
              <a href="#">View report</a>
            </div>
            <Chart />
          </div>

          <div className="panel">
            <div className="panel-head"><h3>Clean Engagement Score</h3></div>
            <div className="donut-wrap">
              <div className="donut"><span className="val">82%</span></div>
              <div className="legend">
                <div><span className="sw" style={{ background: "var(--accent)" }}></span> Real engagement · 82%</div>
                <div><span className="sw" style={{ background: "var(--bg-card-2)" }}></span> Flagged / bot · 18%</div>
                <p style={{ color: "var(--text-mute)", fontSize: 13, marginTop: 6 }}>
                  AI scanned 12.4k interactions in the last 24h.
                </p>
              </div>
            </div>
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
            <div className="camp-grid" style={{ marginTop: 14 }}>
              {allCampaigns.map((c) => (
                <Link key={c.id} href={`/dashboard/campaigns/${c.id}`} className="camp-card">
                  <div className="camp-thumb">
                    {c.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.thumbnailUrl} alt={c.title} />
                    ) : (
                      <div
                        className="camp-thumb-fallback"
                        style={{ background: "linear-gradient(135deg,#ffb43a,#ff7a45)" }}
                      >
                        {(c.title || "C")[0].toUpperCase()}
                      </div>
                    )}
                    {c.contentType && (
                      <span className="camp-badge">{CONTENT_TYPE_LABEL[c.contentType] || c.contentType}</span>
                    )}
                  </div>

                  <div className="camp-body">
                    <div className="camp-top">
                      <span className="camp-reward">${c.reward}<small>/post</small></span>
                      <span className="tag-pill">{PLABEL[c.platform] || c.platform}</span>
                    </div>
                    <h3>{c.title}</h3>
                    <p className="camp-brand">by {c.brandName || "A brand"}</p>
                    {c.brief && <p className="camp-brief">{c.brief}</p>}
                    <div className="camp-foot">
                      <span>{c.submissionCount ?? 0} submissions</span>
                      <span className="camp-join">View &amp; submit →</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
