export const dynamic = "force-dynamic";

import Link from "next/link";
import { auth } from "@/auth";
import { db } from "@/db";
import { campaigns, users, submissions, referralEarnings } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import Sidebar from "@/components/Sidebar";
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
            <Link href="/dashboard/campaigns" className="btn btn-primary">Go to Campaigns</Link>
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
