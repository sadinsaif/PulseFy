export const dynamic = "force-dynamic";

import Link from "next/link";
import { auth } from "@/auth";
import Sidebar from "@/components/Sidebar";
import Chart from "@/components/Chart";
import { isAdminEmail } from "@/lib/admin";

const CHALLENGES = [
  { id: "summer-reels-sprint", emoji: "🎬", grad: "linear-gradient(135deg,#ff7a45,#ffb43a)", name: "Summer Reels Sprint", plats: "TikTok · Instagram", status: "live", statusLabel: "Live", subs: 642, prog: 72, pool: "$12,000" },
  { id: "brand-remix-challenge", emoji: "🎨", grad: "linear-gradient(135deg,#a855f7,#ffb43a)", name: "Brand Remix Challenge", plats: "YouTube · X", status: "review", statusLabel: "In review", subs: 318, prog: 44, pool: "$8,500" },
  { id: "unboxing-hype", emoji: "🔥", grad: "linear-gradient(135deg,#ffb43a,#f4526a)", name: "Unboxing Hype", plats: "TikTok · Reddit", status: "live", statusLabel: "Live", subs: 489, prog: 88, pool: "$15,000" },
  { id: "product-story-contest", emoji: "📸", grad: "linear-gradient(135deg,#ffb43a,#a855f7)", name: "Product Story Contest", plats: "Instagram", status: "ended", statusLabel: "Ended", subs: 491, prog: 100, pool: "$6,000" },
  { id: "creator-voices", emoji: "🎙️", grad: "linear-gradient(135deg,#ff7a45,#a855f7)", name: "Creator Voices", plats: "YouTube · LinkedIn", status: "review", statusLabel: "In review", subs: 210, prog: 30, pool: "$4,700" },
];

export default async function DashboardPage() {
  const session = await auth();
  const user = session?.user;
  const firstName = (user?.name || "there").split(" ")[0];

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
            <input className="search" placeholder="Search campaigns…" />
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

        {/* CHALLENGES TABLE */}
        <section className="panel">
          <div className="panel-head">
            <h3>Recent challenges</h3>
            <a href="#">See all</a>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Challenge</th>
                  <th>Status</th>
                  <th>Submissions</th>
                  <th>Progress</th>
                  <th>Reward pool</th>
                </tr>
              </thead>
              <tbody>
                {CHALLENGES.map((c) => (
                  <tr key={c.id} className="row-link">
                    <td>
                      <Link href={`/challenge/${c.id}`} className="ch-name">
                        <div className="ch-thumb" style={{ background: c.grad }}>{c.emoji}</div>
                        <div><b>{c.name}</b><span>{c.plats}</span></div>
                      </Link>
                    </td>
                    <td><span className={`status ${c.status}`}>{c.statusLabel}</span></td>
                    <td>{c.subs}</td>
                    <td><div className="mini-prog"><i style={{ width: `${c.prog}%` }}></i></div></td>
                    <td>{c.pool}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
